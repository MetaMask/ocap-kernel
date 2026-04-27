# Lift

The lift is the caller-supplied selection policy in the sheaf dispatch
pipeline. It runs when the stalk at an invocation point contains more than one
germ and the sheaf has no data to resolve the ambiguity on its own. The caller
is responsible for writing a lift that is correct for the sections it will
receive.

## Coroutine protocol

The lift is an `async function*` generator, not a plain async function:

```ts
type Lift<M> = (
  germs: EvaluatedSection<Partial<M>>[],
  context: LiftContext<M>,
) => AsyncGenerator<EvaluatedSection<Partial<M>>, void, unknown[]>;
```

The sheaf drives it with the following protocol:

1. **Prime** — `gen.next([])` starts the coroutine. The empty array is
   discarded; it exists only to satisfy the generator type.
2. **Yield** — the coroutine yields a candidate germ to try next. The yielded
   value must be an element of the `germs` array received on entry — the sheaf
   uses object identity to map it back to the original section. Constructing a
   new object with the same shape will throw with a message like "Lift yielded
   an unrecognized germ". Sorting with `[...germs].sort(...)` is safe because
   sort preserves references; mapping to new objects is not.
3. **Attempt** — the sheaf calls the candidate's exo method.
4. **Success** — the result is returned; the generator is abandoned.
5. **Failure** — the sheaf calls `gen.next(errors)`, passing the ordered list
   of every error thrown so far (cumulative, not just the last). The coroutine
   receives this as the resolved value of its `yield` expression.
6. **Exhausted** — if the generator returns without yielding, the sheaf
   rethrows the last error.

Most lifts express a fixed priority order and can ignore the error input:

```ts
const awayLift: Lift<AwayMeta> = async function* (germs) {
  yield* germs.filter((g) => g.metadata?.mode === 'delegation');
  yield* germs.filter((g) => g.metadata?.mode === 'call-home');
};
```

A lift that inspects failure history can read the errors from yield:

```ts
const cautious: Lift<Meta> = async function* (germs) {
  for (const germ of germs) {
    const errors: unknown[] = yield germ;
    // errors is the cumulative list of all failures so far, including the one
    // just returned for this germ. Inspect to decide whether to continue.
    if (errors.some(isUnrecoverable)) return;
  }
};
```

## LiftContext

The second argument to the lift is a `LiftContext`:

```ts
type LiftContext<M> = {
  method: string; // the method being dispatched
  args: unknown[]; // the invocation arguments
  constraints: Partial<M>; // metadata keys identical across every germ
};
```

**`constraints`** are metadata keys whose values are the same on every germ in
the stalk. Because all candidates agree on these keys, they carry no
information useful for choosing between them — the sheaf strips them from each
germ and delivers them separately. A lift that needs to know, say, the agreed
`protocol` version reads it from `context.constraints.protocol` rather than
from any individual germ.

**`args`** is available for cases where the lift itself must inspect the call.
Most of the time, however, arg-dependent selection is better expressed as
`callable` metadata on the sections than as conditional logic in the lift.

Consider a swap where each provider has a different cost curve over volume.
Encode each provider's cost as `callable` metadata evaluated at dispatch time:

```ts
const sections: PresheafSection<SwapMeta>[] = [
  {
    exo: providerAExo,
    metadata: callable((args) => ({ cost: providerACost(Number(args[0])) })),
  },
  {
    exo: providerBExo,
    metadata: callable((args) => ({ cost: providerBCost(Number(args[0])) })),
  },
];
```

By the time the lift runs, `germ.metadata.cost` already holds the concrete
cost for this specific invocation — the swap amount has been applied. A lift
that sorts by cost needs no knowledge of `args` at all:

```ts
const cheapestFirst: Lift<SwapMeta> = async function* (germs) {
  yield* [...germs].sort(
    (a, b) => (a.metadata?.cost ?? 0) - (b.metadata?.cost ?? 0),
  );
};
```

This is why evaluable metadata exists: the arg-dependent logic lives with the
sections that own it, and the lift stays a pure selection policy.

## Semantic equivalence assumption

Two sections may differ in real ways — one might use TCP and the other UDP; one
might be a Rust implementation and the other JavaScript. The semantic
equivalence contract does not require that two sections be identical. It
requires only that **if two sections are indistinguishable by metadata, their
differences are immaterial to the authority invoker**.

The sheaf relies on the following separation of responsibilities:

- **Section constructors** are responsible for advertising every feature that
  matters to callers. If transport protocol, latency tier, cost curve, or
  freshness guarantee could affect the invoker's decision, it belongs in the
  section's metadata. Omitting a distinguishing feature is a declaration that
  callers need not care about it.

- **Lift constructors** are responsible for selecting among the features that
  section constructors have chosen to expose. The lift cannot see what was not
  advertised.

This is a semantic contract, not a runtime enforcement — the sheaf cannot
verify it. When a section constructor omits a feature from metadata, they are
asserting: for any authority invoker using this sheaf, that feature is
irrelevant. If the assertion is wrong, the collapse step may silently discard a
candidate that the lift would have ranked differently.

> One `getBalance` provider uses a fully-synced node; another uses a lagging
> replica. If both are tagged `{ cost: 1 }` with no freshness field, the
> section constructors are asserting that freshness is immaterial to callers of
> this sheaf. If that is not true, `{ cost: 1, freshness: 'lagging' }` vs
> `{ cost: 1, freshness: 'live' }` would let the lift choose.
