# Sheaf

Runtime capability routing adapted from sheaf theory in algebraic topology.

`sheafify({ name, providers })` produces a **sheaf** — an authority manager
over a collection of capability providers. The sheaf produces dispatch sections via
`getSection`, each of which routes invocations through the provider set.

See [INTRODUCTION.md](./docs/INTRODUCTION.md) for what a sheaf is and when to
reach for one, [USAGE.md](./docs/USAGE.md) for annotated examples, and
[POLICY.md](./docs/POLICY.md) for the policy coroutine protocol and semantic
equivalence assumption.

## Install

```sh
yarn add @metamask/sheaves
```

```sh
npm install @metamask/sheaves
```

## Concepts

**Provider** (`Provider`) — The input data: a capability `Section` (exo) paired with
operational metadata, assigned over the open set defined by the exo's guard.
This is an element of the presheaf F = F_sem x F_op.

> A `getBalance(string)` provider with `{ cost: 100 }` is one provider. A
> `getBalance("alice")` provider with `{ cost: 1 }` is another, covering a
> narrower open set.

**Candidate** — An equivalence class of providers at an invocation point,
identified by metadata. At dispatch time, matching providers with identical
metadata are collapsed into a single candidate; the system picks an arbitrary
representative for dispatch. If two capabilities are indistinguishable by
metadata, the sheaf has no data to prefer one over the other.

> At `("getBalance", "alice")` the candidate set might contain two entries
> (cost 1 vs 100); at `("transfer", ...)` it might contain one. Two
> `getBalance(string)` providers both with `{ cost: 1 }` collapse into one
> candidate — the policy never sees both, it receives one representative.

**Policy** — An `async function*` coroutine that yields candidates in
preference order when more than one matches an invocation. See
[POLICY.md](./docs/POLICY.md) for the coroutine protocol, `PolicyContext`, and
the semantic equivalence assumption required of all policies.

At dispatch time, metadata is decomposed into **constraints** (keys with the
same value across every candidate — topologically determined, not a choice) and
**options** (the remaining keys — the policy's actual decision space). The policy
receives only options on each candidate; constraints arrive separately in the
context.

> `argmin` by cost, `argmin` by latency, or any custom selection logic. The
> policy is never invoked when only one candidate remains — either because
> only one provider matched, or because all matching providers had identical
> metadata and collapsed to one representative.

**Sheaf** — The authority manager returned by `sheafify`. Holds the provider
data (frozen at construction time) and exposes factory methods that
produce dispatch sections on demand.

```
const sheaf = sheafify({ name: 'Wallet', providers });
```

- `sheaf.getSection({ guard, policy })` — produce a dispatch section
- `sheaf.getDiscoverableSection({ guard, policy, schema })` — same, but the section exposes its guard

## Dispatch pipeline

At each invocation point `(method, args)` within a granted section:

```
getMatchingProviders(providers, method, args)  presheaf → matches (filter by guard)
evaluateMetadata(matches, args)                metadata specs → concrete values
collapseEquivalent(candidates)                 locality condition (quotient by metadata)
decomposeMetadata(collapsed)                   restriction map (constraints / options)
policy(candidates, { method, args,             operational selection
                  constraints })
dispatch to chosen.exo                         evaluation
```

The pipeline short-circuits at two points: if only one provider matches the
guard, it is invoked directly; if multiple providers match but all collapse to
an identical candidate, the single representative is invoked without calling
the policy.

`callable` metadata specs make the candidate set depend on the invocation
arguments. A `swap(amount)` provider can produce `{ cost: 'low' }` for small
amounts and `{ cost: 'high' }` for large ones, yielding a different set of
candidates — and potentially a different policy outcome — for the same method
called with different arguments.

## Design choices

**Candidate identity is metadata identity.** Within a single equivalence class
(same metadata), the sheaf has no data to prefer one provider over another, so
it picks an arbitrary representative. Callers who need a distinction between
two providers must encode it in metadata. The semantic-equivalence contract
(see [POLICY.md](./docs/POLICY.md)) is the assertion that this is safe.

**Lazy dispatch.** Match, evaluate, collapse, decompose, and policy selection
all run per invocation rather than being precomputed at `sheafify` time. This
keeps `callable` metadata cheap (only providers surviving the guard filter are
evaluated) and lets the candidate set vary with the arguments to a single
method.

**Restriction is implicit in the pipeline.** Filtering by guard
(`getMatchingProviders`) and stripping shared metadata (`decomposeMetadata`)
together yield the local view the policy sees — the candidates and their
distinguishing keys over that point. There is no separate "restrict to a
subdomain" operation; restriction falls out of dispatch.
