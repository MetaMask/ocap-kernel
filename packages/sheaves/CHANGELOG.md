# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** Renamed the `lift` option key on `Sheaf.getSection` and
  `Sheaf.getDiscoverableSection` to `policy`, completing the earlier
  `Lift` → `Policy` type rename. Callers must update their call sites:
  `sheaf.getSection({ guard, lift })` → `sheaf.getSection({ guard, policy })`.

## [0.1.0]

### Added

- Initial release, extracted from `@metamask/kernel-utils`.
- `sheafify({ name, providers })` — constructs a sheaf authority manager over a
  set of capability providers.
- `Provider<M>` type — an input to `sheafify`: a `{ exo, metadata? }` pair
  where `exo` is a `Section` and `metadata` is an optional `MetadataSpec<M>`.
- `Candidate<M>` type — a post-evaluation entry in the candidate set: `{ exo,
metadata }` with metadata already resolved from its spec.
- `Section` type — an exo capability covering a region of the interface
  topology.
- `Policy<M>` type — an `async function*` coroutine that receives candidates
  and yields them in preference order; drives the sheaf dispatch loop.
- `PolicyContext<M>` type — context passed to the policy: `{ method, args,
constraints }`.
- `MetadataSpec<M>` discriminated union with two variants: `constant` and
  `callable`.
- `constant(value)` — static metadata spec; value is fixed at construction.
- `callable(fn)` — callable metadata spec; evaluated per-dispatch with the
  invocation arguments.
- `makeSection(name, guard, handlers)` — creates a named, guarded `Section` from a method-handler map.
- `makeRemoteSection(tag, remoteRef, metadata?)` — builds a provider that
  wraps a remote capability, fetching its interface guard via `E`.
- `noopPolicy` — a policy that yields candidates in the order received.
- `proxyPolicy(gen)` — wraps an existing generator to satisfy the `Policy`
  call signature.
- `withFilter(predicate)` — higher-order policy combinator that pre-filters
  the candidate list before passing it to the inner policy.
- `withRanking(comparator)` — higher-order policy combinator that pre-sorts
  the candidate list before passing it to the inner policy.
- `fallthrough(policyA, policyB)` — composes two policies so that `policyB`
  is tried only after `policyA` is exhausted.
- `Sheaf<M>` type — the authority manager returned by `sheafify`; exposes
  `getSection` and `getDiscoverableSection`.
- `collectSheafGuard(name, sections)` — compute the union interface guard of
  a set of sections, for callers that assemble providers dynamically and need
  to pass an explicit guard to `getSection`.
- `docs/POLICY.md` — documents the policy coroutine protocol,
  `PolicyContext`, and the semantic equivalence assumption.
- `docs/USAGE.md` — annotated usage examples.

[Unreleased]: https://github.com/MetaMask/ocap-kernel/compare/@metamask/sheaves@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/ocap-kernel/releases/tag/@metamask/sheaves@0.1.0
