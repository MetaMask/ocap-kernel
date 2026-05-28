# Sheaf

Runtime capability routing adapted from sheaf theory in algebraic topology.

`sheafify({ name, sections })` produces a **sheaf** — an authority manager
over a presheaf of capabilities. The sheaf produces dispatch sections via
`getSection`, each of which routes invocations through the presheaf.

See [USAGE.md](./USAGE.md) for annotated examples and [LIFT.md](./LIFT.md) for
the lift coroutine protocol and semantic equivalence assumption.

## Concepts

**Presheaf section** (`PresheafSection`) — The input data: a capability (exo)
paired with operational metadata, assigned over the open set defined by the
exo's guard. This is an element of the presheaf F = F_sem x F_op.

> A `getBalance(string)` provider with `{ cost: 100 }` is one presheaf
> section. A `getBalance("alice")` provider with `{ cost: 1 }` is another,
> covering a narrower open set.

**Germ** — An equivalence class of presheaf sections at an invocation point,
identified by metadata. At dispatch time, sections in the stalk with identical
metadata are collapsed into a single germ; the system picks an arbitrary
representative for dispatch. If two capabilities are indistinguishable by
metadata, the sheaf has no data to prefer one over the other.

> Two `getBalance(string)` providers both with `{ cost: 1 }` collapse into
> one germ. The lift never sees both — it receives one representative.

**Stalk** — The set of germs matching a specific `(method, args)` invocation,
computed at dispatch time by guard filtering and then collapsing equivalent
entries.

> Stalk at `("getBalance", "alice")` might contain two germs (cost 1 vs 100);
> stalk at `("transfer", ...)` might contain one.

**Lift** — An `async function*` coroutine that yields candidates from a
multi-germ stalk in preference order. See [LIFT.md](./LIFT.md) for the
coroutine protocol, `LiftContext`, and the semantic equivalence assumption
required of all lifts.

At dispatch time, metadata is decomposed into **constraints** (keys with the
same value across every germ — topologically determined, not a choice) and
**options** (the remaining keys — the lift's actual decision space). The lift
receives only options on each germ; constraints arrive separately in the
context.

> `argmin` by cost, `argmin` by latency, or any custom selection logic. The
> lift is never invoked when the stalk resolves to a single germ — either
> because only one section matched, or because all matching sections had
> identical metadata and collapsed to one representative.

**Sheaf** — The authority manager returned by `sheafify`. Holds the presheaf
data (sections frozen at construction time) and exposes factory methods that
produce dispatch exos on demand.

```
const sheaf = sheafify({ name: 'Wallet', sections });
```

- `sheaf.getSection({ guard, lift })` — produce a dispatch exo
- `sheaf.getDiscoverableSection({ guard, lift, schema })` — same, but the exo exposes its guard

## Dispatch pipeline

At each invocation point `(method, args)` within a granted section:

```
getStalk(sections, method, args)     presheaf → stalk (filter by guard)
evaluateMetadata(stalk, args)        metadata specs → concrete values
collapseEquivalent(stalk)            locality condition (quotient by metadata)
decomposeMetadata(collapsed)         restriction map (constraints / options)
lift(stripped, { method, args,       operational selection (extra-theoretic)
                constraints })
dispatch to chosen.exo               evaluation
```

The pipeline short-circuits at two points: if only one section matches the
guard, it is invoked directly without evaluate/collapse/lift; if all matching
sections collapse to an identical germ, the single representative is invoked
without calling the lift.

`callable` and `source` metadata specs make the stalk shape depend on the
invocation arguments. A `swap(amount)` section can produce `{ cost: 'low' }`
for small amounts and `{ cost: 'high' }` for large ones, yielding a different
set of germs — and potentially a different lift outcome — for the same method
called with different arguments.

## Design choices

**Germ identity is metadata identity.** The collapse step quotients by
metadata: if two sections should be distinguishable, the caller must give them
distinguishable metadata. Sections with identical metadata are treated as
interchangeable. Under the sheaf condition (effect-equivalence), this recovers
the classical equivalence relation on germs.

**Pseudosheafification.** The sheafification functor would precompute the full
etale space. This system defers to invocation time: compute the stalk,
collapse, decompose, lift. The trade-off is that global coherence (a lift
choosing consistently across points) is not guaranteed.

**Restriction and gluing are implicit.** Guard restriction induces a
restriction map on metadata: restricting to a point filters the presheaf to
covering sections (`getStalk`), then `decomposeMetadata` strips the metadata
to distinguishing keys — the restricted metadata over that point. The join
works dually: the union of two sections has the join of their metadata, and
restriction at any point recovers the local distinguishing keys in O(n).
Gluing follows: compatible sections (equal metadata on their overlap) produce a
well-defined join. The dispatch pipeline computes all of this implicitly. The
remaining gap is `revokeSite` (revoking over an open set rather than a point),
which requires an `intersects` operator on guards not yet available.

## Relationship to stacks

This construction is more properly a **stack** in algebraic geometry. We call
it a sheaf because engineers already know "stack" as a LIFO data structure, and
the algebraic geometry term is unrelated. Within a germ, any representative
will do — authority-equivalence is asserted by constructor contract, not
verified at runtime. Between germs, metadata distinguishes them and the lift
resolves the choice.
