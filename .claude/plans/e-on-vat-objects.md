# Plan: Enable E() Usage on Vat Objects from Background

## Overview

Bridge CapTP slots to kernel krefs, enabling `E()` usage on any kernel object reference from the extension background. This uses CapTP's documented extension point `makeCapTPImportExportTables` to intercept slot resolution and create presences backed by krefs that route through `kernel.queueMessage()`.

## Key Insight

The kernel already has `kernel-marshal.ts` that demonstrates the kref↔marshal bridging pattern with `kslot()` and `krefOf()`. We apply the same pattern to CapTP's slot system.

## Architecture

```
Background                    Kernel Worker
   │                              │
   │  E(presence).method(args)    │
   │  ────────────────────────►   │
   │  (kref in slot, method call) │
   │                              │
   │                              │  queueMessage(kref, method, args)
   │                              │  ────────────────────────────►
   │                              │                               Vat
   │  result with krefs           │
   │  ◄────────────────────────   │
   │  (auto-wrapped as presences) │
```

## Implementation Phases

### Phase 1: Kref-Aware Background CapTP

**Files:** `packages/kernel-browser-runtime/src/background-captp.ts`

1. Create `makeKrefImportExportTables()` function:

   - `exportSlot(obj)`: If obj is a kref presence, return the kref string
   - `importSlot(slot)`: If slot is a kref string, create/return a presence

2. Create `makeKrefPresence(kref, sendToKernel)` factory:

   - Uses `resolveWithPresence(handler)` from `@endo/promise-kit`
   - Handler routes `GET`, `CALL`, `SEND` through kernel
   - Caches presences by kref to ensure identity stability

3. Modify `makeBackgroundCapTP()`:
   - Accept `makeCapTPImportExportTables` option
   - Wire up kref tables to CapTP instance

**Key Code Pattern:**

```typescript
function makeKrefPresence(kref: string, sendToKernel: SendFn): object {
  const { resolve, promise } = makePromiseKit();
  resolve(
    resolveWithPresence({
      applyMethod(_target, method, args) {
        return sendToKernel('queueMessage', { target: kref, method, args });
      },
    }),
  );
  return promise;
}
```

### Phase 2: Kernel-Side Kref Serialization

**Files:** `packages/kernel-browser-runtime/src/kernel-worker/captp/kernel-captp.ts`

1. Modify kernel CapTP to use kref-aware slot tables
2. When serializing results, convert kernel objects to kref strings
3. When deserializing arguments, convert kref strings to kernel dispatch targets

### Phase 3: Public API

**Files:** `packages/kernel-browser-runtime/src/background-captp.ts`

Export utilities:

- `resolveKref(kref: string): Promise<object>` - Get E()-usable presence for a kref
- `isKrefPresence(obj: unknown): boolean` - Type guard
- `krefOf(presence: object): string | undefined` - Extract kref from presence

### Phase 4: Promise Kref Handling

**Files:** Background and kernel CapTP files

1. Handle `kp*` (kernel promise) krefs specially
2. Subscribe to promise resolution via kernel
3. Forward resolution/rejection to background promise
4. Add `subscribePromise(kpref)` to KernelFacade

### Phase 5: Argument Serialization

**Files:** Background CapTP

1. When calling `E(presence).method(arg1, arg2)`, serialize args through kref tables
2. Local objects passed as args need special handling (potential future export)
3. For Phase 1, only support passing kref presences and primitives as arguments

### Phase 6: Garbage Collection

**Files:** Background CapTP, KernelFacade

1. Use `FinalizationRegistry` to detect when presences are GC'd
2. Batch and send `dropKref(kref)` to kernel
3. Add `dropKref(kref: string)` method to KernelFacade
4. Kernel routes to appropriate vat for cleanup

## File Changes Summary

| File                                                              | Changes                                       |
| ----------------------------------------------------------------- | --------------------------------------------- |
| `kernel-browser-runtime/src/background-captp.ts`                  | Add kref tables, presence factory, public API |
| `kernel-browser-runtime/src/kernel-worker/captp/kernel-captp.ts`  | Add kref serialization                        |
| `kernel-browser-runtime/src/kernel-worker/captp/kernel-facade.ts` | Add `dropKref`, `subscribePromise`            |
| `kernel-browser-runtime/src/index.ts`                             | Export new utilities                          |

## Dependencies

- `@endo/promise-kit` - For `resolveWithPresence`
- `@endo/captp` - Existing, use `makeCapTPImportExportTables` option

## Testing Strategy

1. Unit tests for kref presence factory
2. Unit tests for import/export tables
3. Integration test: Background → Kernel → Vat round-trip
4. Test nested objects with multiple krefs
5. Test promise kref resolution
6. Test GC cleanup (may need manual triggering)

## Success Criteria

```typescript
// In background console:
const kernel = await kernel.getKernel();
const counterRef = await E(kernel).resolveKref('ko42'); // Get presence for a kref
const count = await E(counterRef).increment(); // E() works!
const nested = await E(counterRef).getRelated(); // Returns more presences
await E(nested.child).doSomething(); // Nested presences work
```

## Open Questions

1. **Initial kref discovery**: How does background learn about krefs? Options:

   - `getStatus()` returns caplet export krefs
   - Registry vat pattern from PLAN.md Phase 2
   - Explicit `getCapletExports(subclusterId)` method

2. **Bidirectional exports**: Should background be able to export objects to vats?
   - Phase 1: No (background is consumer only)
   - Future: Yes (requires reverse slot mapping)

## Risks

- **Performance**: Each E() call goes through kernel message queue
- **Memory leaks**: If FinalizationRegistry doesn't fire, krefs accumulate
- **Complexity**: Full object graph means any result can contain arbitrarily nested presences
