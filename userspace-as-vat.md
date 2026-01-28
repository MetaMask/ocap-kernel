# Plan: System Vats/Subclusters for ocap-kernel

## Overview

Enable user space (omnium) to use `E()` on vat object presences directly by making the background (and optionally UI) part of a **system subcluster** called the "host subcluster".

## Problem Statement

Currently, the background communicates with the kernel via CapTP and receives kref strings. To call methods on vat objects, it must use `kernel.queueMessage(kref, method, args)` which returns more kref strings. The `rekm/kref-presence` branch attempted to solve this by creating "dummy" presences that forward to `queueMessage()`, but this approach is complex and doesn't integrate well with the kernel's reference management.

## Solution

Introduce **system subclusters** - subclusters whose vats run without compartment isolation in the host process. The first system subcluster is the **host subcluster**:

- **System vats** run without compartments, directly in the host process (e.g., background service worker)
- **System subclusters** are configurable like dynamic subclusters, with a bootstrap vat and optional additional vats
- The **host subcluster** bootstrap vat receives a kernel facet as a vatpower
- The bootstrap vat controls how kernel access is shared with other vats in the subcluster

This enables:
- E()-callable presences from krefs
- Third-party handoff between vats
- Promise pipelining
- Proper integration with kernel GC

## Terminology

- **System vat**: A vat that runs without compartment isolation in the host process
- **System subcluster**: A subcluster composed of system vats
- **Host subcluster**: The specific system subcluster for the host application (omnium)
- **Dynamic vat/subcluster**: Regular vats that run in compartments (existing behavior)

## Key Constraints

1. System vats do NOT execute in a compartment - run directly in host process
2. System vats do NOT participate in kernel persistence machinery
3. System subcluster bootstrap vat receives a kernel facet as a vatpower
4. System vats do NOT export durable capabilities
5. Both browser and Node.js runtimes must be supported

## Architecture

```
Host Process (Background/Node.js)           Kernel
+---------------------------------------+   +---------------------------+
| Host Subcluster (System Subcluster)   |   |                           |
| +-----------------------------------+ |   |                           |
| | Bootstrap Vat (e.g., background)  | |   |  SystemVatHandle (per vat)|
| | - receives kernel facet vatpower  |<--->|  - EndpointHandle impl    |
| | - uses E() on presences           | |   |  - VRef<->KRef xlat       |
| +-----------------------------------+ |   |                           |
| +-----------------------------------+ |   |                           |
| | Other vats (e.g., UI)             |<--->|  SystemVatHandle (per vat)|
| | - receives refs from bootstrap    | |   |                           |
| +-----------------------------------+ |   |                           |
|                                       |   |                           |
| SystemVatSupervisor (per vat)         |   |  KernelRouter             |
| - liveslots (no compartment)          |   |  - routes to system vats  |
| - dispatch function                   |   |                           |
| - syscall interface                   |   |  KernelFacet service      |
+---------------------------------------+   +---------------------------+
```

## Key Design Decisions

### D1: Liveslots Without Compartment
Run liveslots in the host process WITHOUT compartment isolation. The `buildVatNamespace` callback returns the vat module directly (no `importBundle`). This provides:
- VRef allocation and clist management
- Presence creation for imported objects
- Syscall interface
- Promise tracking

### D2: System Vat ID Format
Use `sv0`, `sv1`, etc. (prefix "sv" for "system vat") to distinguish from dynamic vats (`v0`, `v1`).

### D3: Kernel Facet as Vatpower (Bootstrap Only)
The kernel facet is a vatpower passed ONLY to the system subcluster's bootstrap vat:
- `launchSubcluster(config)` - launch dynamic subclusters, returns presences
- `terminateSubcluster(id)`
- `getStatus()`
- Other privileged operations

Other vats in the system subcluster receive access via normal vat-to-vat communication from bootstrap.

### D4: Configurable System Subcluster
System subclusters are configurable like dynamic subclusters:
- Define bootstrap vat and additional vats
- Bootstrap vat receives kernel facet vatpower
- Bootstrap message passes roots to all vats in subcluster
- Bootstrap vat controls access distribution

### D5: Both Runtimes Supported
Implementation must work for both:
- Browser: `packages/kernel-browser-runtime`
- Node.js: `packages/nodejs`

Core system vat logic in `packages/ocap-kernel` is runtime-agnostic.

## Implementation Phases

### Phase 1: Core Infrastructure (packages/ocap-kernel)

**1.1: Add system vat types to types.ts**
- Add `SystemVatId` type (`sv${number}`)
- Add `isSystemVatId()` type guard
- Update `EndpointId` to include `SystemVatId`
- Add `SystemSubclusterConfig` type (extends ClusterConfig with system vat specifics)

**1.2: Create SystemVatHandle**
File: `packages/ocap-kernel/src/vats/SystemVatHandle.ts`

Similar to `VatHandle` but:
- Does NOT manage vatstore persistence (system vats are non-durable)
- Simpler `#getDeliveryCrankResults()` - no vatstore checkpoints
- Communication via callback functions instead of streams (runtime provides transport)

**1.3: Create SystemVatSyscall**
File: `packages/ocap-kernel/src/vats/SystemVatSyscall.ts`

Reuse logic from `VatSyscall.ts` but:
- No persistence concerns
- Simpler state tracking

**1.4: Create KernelFacetService**
File: `packages/ocap-kernel/src/services/KernelFacetService.ts`

Provides privileged kernel operations as a remotable object:
- `launchSubcluster(config)` - launch dynamic subclusters
- `terminateSubcluster(id)`
- `getStatus()`
- `reloadSubcluster(id)`

**1.5: Create SystemSubclusterManager**
File: `packages/ocap-kernel/src/vats/SystemSubclusterManager.ts`

Manages system subclusters:
- Launches system vats with correct vatpowers
- Bootstrap vat receives kernel facet
- Coordinates with SubclusterManager for tracking

**1.6: Update Kernel.ts**
- Add `launchSystemSubcluster()` method
- Update `#getEndpoint()` to handle system vat IDs
- Register KernelFacetService during initialization
- Accept system vat connection callbacks from runtime

### Phase 2: Shared System Vat Supervisor (new package or in ocap-kernel)

**2.1: Create SystemVatSupervisor**
File: `packages/ocap-kernel/src/vats/SystemVatSupervisor.ts`

Runtime-agnostic supervisor for system vats:
- Uses liveslots without compartment
- `buildVatNamespace` returns provided module directly
- Non-persistent vatstore (Map-based)
- Accepts syscall callback for kernel communication
- Provides dispatch function for deliveries

This is in ocap-kernel because it's runtime-agnostic - runtimes just provide the transport.

### Phase 3: Browser Runtime (packages/kernel-browser-runtime)

**3.1: Create host subcluster utilities**
File: `packages/kernel-browser-runtime/src/host-subcluster/index.ts`

- `makeHostSubcluster()` factory function
- Sets up SystemVatSupervisor for each vat in host subcluster
- Provides transport (MessagePort) between supervisors and kernel

**3.2: Update kernel-worker initialization**
File: `packages/kernel-browser-runtime/src/kernel-worker/kernel-worker.ts`

- Remove CapTP setup
- Accept host subcluster vat connections
- Register SystemVatHandles with kernel

**3.3: Remove CapTP code**
Files to remove:
- `packages/kernel-browser-runtime/src/background-captp.ts`
- `packages/kernel-browser-runtime/src/kernel-worker/captp/` directory

### Phase 4: Node.js Runtime (packages/nodejs)

**4.1: Create host subcluster utilities**
File: `packages/nodejs/src/host-subcluster/index.ts`

- Similar to browser but using appropriate transport (direct calls or MessageChannel)
- `makeHostSubcluster()` factory function

**4.2: Update Node.js kernel initialization**
- Support host subcluster configuration
- Register SystemVatHandles

### Phase 5: Integration

**5.1: Update omnium-gatherum**
- Use `makeHostSubcluster()` instead of `makeBackgroundCapTP()`
- Background code becomes bootstrap vat's `buildRootObject`
- UI (if in host subcluster) becomes another vat
- Bootstrap vat distributes kernel access as needed

## Critical Files

### Files to Create
| File | Purpose |
|------|---------|
| `packages/ocap-kernel/src/vats/SystemVatHandle.ts` | EndpointHandle for system vats (kernel-side) |
| `packages/ocap-kernel/src/vats/SystemVatSyscall.ts` | Syscall handler for system vats |
| `packages/ocap-kernel/src/vats/SystemVatSupervisor.ts` | Liveslots supervisor (runtime-agnostic) |
| `packages/ocap-kernel/src/vats/SystemSubclusterManager.ts` | Manages system subcluster lifecycle |
| `packages/ocap-kernel/src/services/KernelFacetService.ts` | Kernel facet exposed to bootstrap vat |
| `packages/kernel-browser-runtime/src/host-subcluster/index.ts` | Browser host subcluster setup |
| `packages/nodejs/src/host-subcluster/index.ts` | Node.js host subcluster setup |

### Files to Modify
| File | Changes |
|------|---------|
| `packages/ocap-kernel/src/types.ts` | Add `SystemVatId`, `isSystemVatId()`, `SystemSubclusterConfig` |
| `packages/ocap-kernel/src/Kernel.ts` | Add `launchSystemSubcluster()`, update `#getEndpoint()` |
| `packages/kernel-browser-runtime/src/kernel-worker/kernel-worker.ts` | Remove CapTP, add system vat support |

### Files to Remove
| File | Reason |
|------|--------|
| `packages/kernel-browser-runtime/src/background-captp.ts` | Replaced by host subcluster |
| `packages/kernel-browser-runtime/src/kernel-worker/captp/` | Replaced by host subcluster |

## Key Implementation Details

### buildVatNamespace Without Compartment

```typescript
// In SystemVatSupervisor
const buildVatNamespace = async (
  lsEndowments: Record<PropertyKey, unknown>,
  _inescapableGlobalProperties: object,
): Promise<Record<string, unknown>> => {
  // NO importBundle - return the system vat module directly
  return {
    buildRootObject: this.#buildRootObject,
  };
};
```

### System Subcluster Configuration

```typescript
type SystemSubclusterConfig = {
  bootstrap: string;              // Name of bootstrap vat
  vats: Record<string, {          // Map of vat names to their modules
    buildRootObject: BuildRootObjectFn;
  }>;
};

// Example usage
const hostSubclusterConfig = {
  bootstrap: 'background',
  vats: {
    background: { buildRootObject: backgroundBuildRootObject },
    ui: { buildRootObject: uiBuildRootObject },
  },
};
```

### Syscall Flow

```
System Vat Code -> E(presence).method(args)
               -> liveslots marshals to VRef
               -> syscall.send(vref, methargs, resultVRef)
               -> SystemVatSupervisor.executeSyscall()
               -> [transport callback] -> SystemVatHandle
               -> SystemVatSyscall.handleSyscall() (VRef->KRef)
               -> KernelQueue.enqueueSend()
```

### Delivery Flow

```
KernelQueue -> KernelRouter.deliver()
           -> SystemVatHandle.deliverMessage(vref, message)
           -> [transport callback] -> SystemVatSupervisor
           -> liveslots.dispatch(['message', ...])
           -> System vat code method invoked with presence args
```

### Host Subcluster Bootstrap

```typescript
// Bootstrap vat receives kernel facet as vatpower
export function buildRootObject({ kernelFacet }, parameters) {
  return makeDefaultExo('hostRoot', {
    async bootstrap(roots, services) {
      // roots contains presences to other vats in host subcluster
      // e.g., roots.ui is the UI vat's root object

      // Launch a dynamic subcluster
      const result = await E(kernelFacet).launchSubcluster(dynamicConfig);
      // result.root is an E()-callable presence!

      // Pass reference to UI vat if needed
      await E(roots.ui).setKernel(kernelFacet);
    }
  });
}
```

### Obtaining Presences from Kernel Facet

When `E(kernelFacet).launchSubcluster(config)` is called:
1. KernelFacetService's method calls kernel, gets result with root kref
2. Result serialized with kref in slots via kernel-marshal
3. Delivered to system vat via `deliverNotify`
4. Liveslots sees kref slot, creates presence via c-list
5. Bootstrap vat receives E()-callable presence directly

## Verification

### Unit Tests
- `SystemVatHandle` tests: Mock supervisor, test delivery/syscall handling
- `SystemVatSupervisor` tests: Mock kernel connection, test liveslots integration
- `SystemSubclusterManager` tests: Test subcluster lifecycle
- `KernelFacetService` tests: Test service methods

### Integration Tests
- Full host subcluster lifecycle with real kernel
- Multiple vats in host subcluster communicating
- Bootstrap vat distributing kernel access to other vats
- Third-party handoff between dynamic and system vats
- Promise pipelining through system vats

### E2E Tests
- Migrate/adapt tests from `rekm/kref-presence` branch
- Test behaviors from `kernel-to-host-captp.test.ts`
- Browser: background + UI as host subcluster
- Node.js: equivalent host subcluster tests
