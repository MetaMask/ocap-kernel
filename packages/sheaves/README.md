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
identified by metadata. At dispatch time, providers in the stalk with identical
metadata are collapsed into a single candidate; the system picks an arbitrary
representative for dispatch. If two capabilities are indistinguishable by
metadata, the sheaf has no data to prefer one over the other.

> Two `getBalance(string)` providers both with `{ cost: 1 }` collapse into
> one candidate. The policy never sees both — it receives one representative.

**Stalk** — The set of candidates matching a specific `(method, args)` invocation,
computed at dispatch time by guard filtering and then collapsing equivalent
entries.

> Stalk at `("getBalance", "alice")` might contain two candidates (cost 1 vs 100);
> stalk at `("transfer", ...)` might contain one.

**Policy** — An `async function*` coroutine that yields candidates from a
multi-candidate stalk in preference order. See [POLICY.md](./docs/POLICY.md)
for the coroutine protocol, `PolicyContext`, and the semantic equivalence
assumption required of all policies.

At dispatch time, metadata is decomposed into **constraints** (keys with the
same value across every candidate — topologically determined, not a choice) and
**options** (the remaining keys — the policy's actual decision space). The policy
receives only options on each candidate; constraints arrive separately in the
context.

> `argmin` by cost, `argmin` by latency, or any custom selection logic. The
> policy is never invoked when the stalk resolves to a single candidate — either
> because only one provider matched, or because all matching providers had
> identical metadata and collapsed to one representative.

**Sheaf** — The authority manager returned by `sheafify`. Holds the provider
data (frozen at construction time) and exposes factory methods that
produce dispatch sections on demand.

```
const sheaf = sheafify({ name: 'Wallet', providers });
```

- `sheaf.getSection({ guard, lift })` — produce a dispatch section
- `sheaf.getDiscoverableSection({ guard, lift, schema })` — same, but the section exposes its guard

## Dispatch pipeline

At each invocation point `(method, args)` within a granted section:

```
getStalk(providers, method, args)    presheaf → stalk (filter by guard)
evaluateMetadata(stalk, args)        metadata specs → concrete values
collapseEquivalent(stalk)            locality condition (quotient by metadata)
decomposeMetadata(collapsed)         restriction map (constraints / options)
policy(candidates, { method, args,   operational selection (extra-theoretic)
                  constraints })
dispatch to chosen.exo           evaluation
```

The pipeline short-circuits at two points: if only one provider matches the
guard, it is invoked directly without evaluate/collapse/policy; if all matching
providers collapse to an identical candidate, the single representative is invoked
without calling the policy.

`callable` metadata specs make the stalk shape depend on the invocation
arguments. A `swap(amount)` provider can produce `{ cost: 'low' }` for small
amounts and `{ cost: 'high' }` for large ones, yielding a different set of
candidates — and potentially a different policy outcome — for the same method
called with different arguments.

## Design choices

**Candidate identity is metadata identity.** The collapse step quotients by
metadata: if two providers should be distinguishable, the caller must give them
distinguishable metadata. Providers with identical metadata are treated as
interchangeable. Under the sheaf condition (effect-equivalence), this recovers
the classical equivalence relation on germs.

**Pseudosheafification.** The sheafification functor would precompute the full
etale space. This system defers to invocation time: compute the stalk,
collapse, decompose, select via policy. The trade-off is that global coherence
(a policy choosing consistently across points) is not guaranteed.

**Restriction and gluing are implicit.** Guard restriction induces a
restriction map on metadata: restricting to a point filters the presheaf to
covering providers (`getStalk`), then `decomposeMetadata` strips the metadata
to distinguishing keys — the restricted metadata over that point. The join
works dually: the union of two providers has the join of their metadata, and
restriction at any point recovers the local distinguishing keys in O(n).
Gluing follows: compatible providers (equal metadata on their overlap) produce a
well-defined join. The dispatch pipeline computes all of this implicitly. The
remaining gap is `revokeSite` (revoking over an open set rather than a point),
which requires an `intersects` operator on guards not yet available.

## Relationship to stacks

This construction is more properly a **stack** in algebraic geometry. We call
it a sheaf because engineers already know "stack" as a LIFO data structure, and
the algebraic geometry term is unrelated. Within a candidate, any representative
will do — authority-equivalence is asserted by constructor contract, not
verified at runtime. Between candidates, metadata distinguishes them and the
policy resolves the choice.
