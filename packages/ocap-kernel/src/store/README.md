# Kernel Store

The kernel store (`makeKernelStore` in `index.ts`) wraps the raw
`KernelDatabase` from `@metamask/kernel-store` and exposes typed methods for
all kernel-state access. Raw `kv` is intentionally not exposed — all reads and
writes go through these methods to preserve branded type safety.

## Data integrity

Branded identifier types (`KRef`, `VatId`, `EndpointId`, etc.) are applied via
`as` casts when reading from the KV store. This means persistence reads are
trusted — there are no runtime type checks on values coming out of the
database.

This is intentional; we type our writes and assume that the persistence layer
maintains its integrity. Ad hoc runtime type assertions on individual reads do not
meaningfully improve safety: if the persistence layer silently corrupts data,
spot-checking a subset of reads cannot provide a reliable guarantee. Data
integrity is instead enforced structurally:

- The database engine's own integrity mechanisms (transactions, WAL, checksums).
- Validated writes: all values entering the store pass through typed store
  methods or validated constructors (e.g., `makeGCAction()`).
- Migration correctness: schema changes must transform all affected keys.

See the trust model documentation at the top of `../types.ts` for how branded
types are validated at other boundaries (external input, translators, internal
construction).
