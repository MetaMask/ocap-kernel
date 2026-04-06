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
spot-checking a subset of reads cannot provide a reliable guarantee.

Today, `@metamask/kernel-store` is backed by SQLite (`better-sqlite3` /
`@sqlite.org/sqlite-wasm`). The only integrity mechanism currently in place is
SQLite's ACID transaction support (including savepoints for crank rollback).
There is no WAL configuration, no checksums, no `PRAGMA integrity_check`, and
no schema-level validation beyond primary key constraints.

More work is needed to provide real data integrity guarantees. That work belongs
in the database and storage layers (`@metamask/kernel-store` and its backing
store), not in the application-layer read path. Possible directions include
configuring WAL mode, periodic integrity checks, application-level checksums,
and stricter schema constraints.

### Write-side safety

Validated writes are the first line of defense:

- All values entering the store pass through typed store methods or validated
  constructors (e.g., `makeGCAction()`).
- Migration correctness: schema changes must transform all affected keys.

See the trust model documentation at the top of `../types.ts` for how branded
types are validated at other boundaries (external input, translators, internal
construction).
