# What a sheaf is

`@metamask/sheaves` lets you stitch a single dispatch surface from a
collection of capabilities that _ought to_ do the same thing — even when
they don't literally share an implementation.

This doc explains the problem the sheaf solves and when you'd reach for one.

## Attenuation: the ocap baseline

In object-capability programming, you restrict authority by **attenuating** a
capability: wrapping it in a proxy that exposes a strict subset of its powers.
A `FileSystem` capability becomes a `Read("/home/alice")` capability by
wrapping it in something that forwards only read operations under
`/home/alice` and refuses everything else.

The attenuator never adds authority. An attenuated capability is a narrower
projection of the same underlying object.

## Strict attenuations compose for free

When two capabilities are strict proxy attenuations of the **same** base,
their overlapping surfaces necessarily agree — both forward to the same
underlying implementation, so behavior is identical wherever their scopes
intersect.

Composition is then a matter of bookkeeping. If `aliceCap = Read("foo/bar")`
and `bobCap = Read("foo/baz")` are both attenuations of the same
`FileSystem`, their union is `Read("foo/{bar,baz}")`. And unions of unions
are coherent, too: `Read("foo/{bar,baz}")` composes with `Read("foo/{baz,bux}")`
into `Read("foo/{bar,baz,bux}")`. Where the scopes overlap (here: `foo/baz`),
the shared base ensures coherent behavior — there is nothing to reconcile.

This is the easy case, ocap composition of related attenuations.

## Sheaves: alignment without a shared base

Often you want to behave _as if_ you had a common base when you don't. Two
implementations of a wallet API; a local exo and a remote capability over
CapTP; replicas with different cost profiles. No shared origin to inherit
alignment from — but the surfaces are supposed to mean the same thing, and
the caller wants a single capability that routes invocations to whichever
provider is right.

A **sheaf** is the construction that lets you assert this alignment by
contract instead of proving it by attenuation. You hand `sheafify` a set
of providers — each a capability with a guard describing the open set of
invocations it supports, plus optional metadata distinguishing it from its
peers — and you get back an authority manager that glues these pieces into
a single dispatch surface.

The alignment is the load-bearing assumption (the **sheaf condition**):
two providers that both cover the same `(method, args)` point are presumed
to produce equivalent observable effects. The system trusts that contract;
that trust is what makes the framework work without a literal shared base.

## The dispatch surface is a section

What you get back from the sheaf is a **section** — a capability covering
some open set of the combined surface, restricted by an explicit guard:

```ts
const sheaf = sheafify({ name: 'Wallet', providers });
const userFacing = sheaf.getSection({ guard: userGuard, policy });
```

`getSection` is itself attenuation: it takes the full combined surface that
the sheaf has glued together and hands back a narrower view restricted by
`userGuard`. The sheaf has done the hard part — asserting alignment so the
providers can be treated as one — and `getSection` carves a slice out of
that unified surface for the caller. The result is that you can attenuate
a composition of capabilities the same way you would attenuate a single
one. And because the returned section is itself a capability, it can be
a provider to another sheaf - the construction composes with itself.

The guard determines what is invokable through `userFacing`. Anything
outside the guard is simply not in the interface — there is no extra
authorization step, no access check. Unauthorized invocations are
unsupported in the same flat sense that calling a missing method on any
ocap is unsupported.

Where multiple providers cover the same invocation, a caller-supplied
**policy** selects which one runs (see [POLICY.md](./POLICY.md)). Where
exactly one covers it, the choice is forced. See [USAGE.md](./USAGE.md) for
worked examples.
