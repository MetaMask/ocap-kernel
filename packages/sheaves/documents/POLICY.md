# Policy

The policy is the caller-supplied selection coroutine in the sheaf dispatch
pipeline. It runs when more than one candidate matches an invocation and the sheaf
has no data to resolve the ambiguity on its own. The
caller is responsible for writing a policy that is correct for the providers it
will receive.

## Coroutine protocol

The policy is an `async function*` generator, not a plain async function:

```ts
type Policy<M> = (
  candidates: Candidate<Partial<M>>[],
  context: PolicyContext<M>,
) => AsyncGenerator<Candidate<Partial<M>>, void, unknown[]>;
```

The sheaf drives it with the following protocol:

1. **Prime** — `gen.next([])` starts the coroutine. The empty array is
   discarded; it exists only to satisfy the generator type.
2. **Yield** — the coroutine yields a candidate to try next. The yielded value
   must be an element of the `candidates` array received on entry — the sheaf
   uses object identity to map it back to the original provider. Constructing a
   new object with the same shape will throw with a message like "Policy yielded
   an unrecognized candidate". Sorting with `[...candidates].sort(...)` is safe
   because sort preserves references; mapping to new objects is not.
3. **Attempt** — the sheaf calls the candidate's handler method.
4. **Success** — the result is returned; the generator is abandoned.
5. **Failure** — the sheaf calls `gen.next(errors)`, passing the ordered list
   of every error thrown so far (cumulative, not just the last). The coroutine
   receives this as the resolved value of its `yield` expression.
6. **Exhausted** — if the generator returns without yielding, the sheaf throws
   `new Error('No viable handler for <method>', { cause: errors })` where
   `errors` is the full accumulated list of every failure so far.

Most policies express a fixed priority order and can ignore the error input:

```ts
const awayPolicy: Policy<AwayMeta> = async function* (candidates) {
  yield* candidates.filter((c) => c.metadata?.mode === 'delegation');
  yield* candidates.filter((c) => c.metadata?.mode === 'call-home');
};
```

A policy that inspects failure history can read the errors from yield:

```ts
const cautious: Policy<Meta> = async function* (candidates) {
  for (const candidate of candidates) {
    const errors: unknown[] = yield candidate;
    // errors is the cumulative list of all failures so far, including the one
    // just returned for this candidate. Inspect to decide whether to continue.
    if (errors.some(isUnrecoverable)) return;
  }
};
```

## PolicyContext

The second argument to the policy is a `PolicyContext`:

```ts
type PolicyContext<M> = {
  method: string; // the method being dispatched
  args: unknown[]; // the invocation arguments
  constraints: Partial<M>; // metadata keys identical across every candidate
};
```

**`constraints`** are metadata keys whose values are the same across every
candidate. Because all candidates agree on these keys, they carry no
information useful for choosing between them — the sheaf strips them from
each candidate and delivers them separately. A policy that needs to know, say,
the agreed `protocol` version reads it from `context.constraints.protocol`
rather than from any individual candidate.

**`args`** is available for cases where the policy itself must inspect the
call. Most of the time, however, arg-dependent selection is better expressed as
`callable` metadata on the providers than as conditional logic in the policy.

Consider a swap where each provider has a different cost curve over volume.
Encode each provider's cost as `callable` metadata evaluated at dispatch time:

```ts
const providers: Provider<SwapMeta>[] = [
  {
    handler: providerAHandler,
    metadata: callable((args) => ({ cost: providerACost(Number(args[0])) })),
  },
  {
    handler: providerBHandler,
    metadata: callable((args) => ({ cost: providerBCost(Number(args[0])) })),
  },
];
```

By the time the policy runs, `candidate.metadata.cost` already holds the
concrete cost for this specific invocation — the swap amount has been applied.
A policy that sorts by cost needs no knowledge of `args` at all:

```ts
const cheapestFirst: Policy<SwapMeta> = async function* (candidates) {
  yield* [...candidates].sort(
    (a, b) => (a.metadata?.cost ?? 0) - (b.metadata?.cost ?? 0),
  );
};
```

This is why evaluable metadata exists: the arg-dependent logic lives with the
providers that own it, and the policy stays a pure selection coroutine.

## Semantic equivalence assumption

Two providers may differ in real ways — one might use TCP and the other UDP;
one might be a Rust implementation and the other JavaScript. The semantic
equivalence contract does not require that two providers be identical. It
requires only that **if two providers are indistinguishable by metadata, their
differences are immaterial to the authority invoker**.

The sheaf relies on the following separation of responsibilities:

- **Provider constructors** are responsible for advertising every feature that
  matters to callers. If transport protocol, latency tier, cost curve, or
  freshness guarantee could affect the invoker's decision, it belongs in the
  provider's metadata. Omitting a distinguishing feature is a declaration that
  callers need not care about it.

- **Policy constructors** are responsible for selecting among the features that
  provider constructors have chosen to expose. The policy cannot see what was
  not advertised.

This is a semantic contract, not a runtime enforcement — the sheaf cannot
verify it. When a provider constructor omits a feature from metadata, they are
asserting: for any authority invoker using this sheaf, that feature is
irrelevant. If the assertion is wrong, the collapse step may silently discard a
candidate that the policy would have ranked differently.

> One `getBalance` provider uses a fully-synced node; another uses a lagging
> replica. If both are tagged `{ cost: 1 }` with no freshness field, the
> provider constructors are asserting that freshness is immaterial to callers
> of this sheaf. If that is not true, `{ cost: 1, freshness: 'lagging' }` vs
> `{ cost: 1, freshness: 'live' }` would let the policy choose.
