# Kernel-to-Host CapTP Serialization Flow

This document explains the serialization pipeline between the kernel and host application, covering how data is marshaled as it flows across process boundaries.

## Table of Contents

- [Overview](#overview)
- [Key Components](#key-components)
- [Outbound Flow: Host Application to Kernel](#outbound-flow-host-application-to-kernel)
- [Inbound Flow: Kernel to Host Application](#inbound-flow-kernel-to-host-application)
- [Slot Types](#slot-types)
- [Custom Conversion Functions](#custom-conversion-functions)
- [Supported Data Types](#supported-data-types)

## Overview

The serialization pipeline enables communication between the host application (running in the main process) and the kernel (running in a web worker). This involves multiple levels of marshaling to handle object references across process boundaries.

The pipeline uses three distinct marshals, each handling a different scope:

1. **CapTP marshal** - Handles cross-process communication via `postMessage`
2. **Kernel marshal** - Handles kernel-internal message storage and vat delivery
3. **PresenceManager marshal** - Converts kernel references to callable presences for the host

## Key Components

### Source Files

| Component               | Location                                                                                                                                                  | Purpose                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| KRef-Presence utilities | [`packages/ocap-kernel/src/kref-presence.ts`](../packages/ocap-kernel/src/kref-presence.ts)                                                               | Converts between KRefs and presences |
| Kernel facade           | [`packages/kernel-browser-runtime/src/kernel-worker/captp/kernel-facade.ts`](../packages/kernel-browser-runtime/src/kernel-worker/captp/kernel-facade.ts) | CapTP interface to kernel            |
| KernelQueue             | [`packages/ocap-kernel/src/KernelQueue.ts`](../packages/ocap-kernel/src/KernelQueue.ts)                                                                   | Queues and processes messages        |
| Kernel marshal          | [`packages/ocap-kernel/src/liveslots/kernel-marshal.ts`](../packages/ocap-kernel/src/liveslots/kernel-marshal.ts)                                         | Serializes data for kernel storage   |

### Marshals in the System

| Marshal                 | Location            | Slot Type    | Body Format | When Used                    |
| ----------------------- | ------------------- | ------------ | ----------- | ---------------------------- |
| CapTP marshal           | `@endo/captp`       | `o+N`, `p+N` | capdata     | Cross-process `E()` calls    |
| Kernel marshal          | `kernel-marshal.ts` | `ko*`, `kp*` | smallcaps   | Kernel-to-vat messages       |
| PresenceManager marshal | `kref-presence.ts`  | `ko*`, `kp*` | smallcaps   | Deserialize results for host |

## Outbound Flow: Host Application to Kernel

When the host application sends a message to a vat via the kernel:

```
Host Application                            Kernel Worker
     │                                           │
     │  1. Prepare call with kref strings        │
     │     { target: 'ko42', method: 'foo' }     │
     │                                           │
     │  2. convertKrefsToStandins()              │
     │     'ko42' → kslot() → Exo remotable      │
     │                                           │
     │  3. E(kernelFacade).queueMessage()        │
     │     CapTP serialize: remotable → o+1      │
     │                                           │
     │  ──────── postMessage channel ──────────► │
     │                                           │
     │                                           │  4. CapTP deserialize
     │                                           │     o+1 → remotable
     │                                           │
     │                                           │  5. kser([method, args])
     │                                           │     remotable → 'ko42' in slots
     │                                           │
     │                                           │  6. Message stored for vat delivery
     │                                           │     Format: CapData<KRef>
     │                                           │
```

### Step-by-Step Breakdown

1. **Host prepares call** - The host application prepares a message with kref strings identifying the target object and any object references in the arguments.

2. **Convert krefs to standins** - `convertKrefsToStandins()` transforms kref strings into Exo remotable objects that CapTP can serialize. This happens in `kernel-facade.ts`.

3. **CapTP serializes** - When `E(kernelFacade).queueMessage()` is called, CapTP's internal marshal converts the remotable objects into CapTP-style slots (`o+1`, `p+2`, etc.).

4. **CapTP deserializes** - On the kernel worker side, CapTP converts the slots back to remotable objects.

5. **Kernel marshal serializes** - `kser([method, args])` converts the remotables to CapData with kref slots (`ko42`, `kp99`).

6. **Message stored** - The kernel stores the message in `CapData<KRef>` format for delivery to the target vat.

## Inbound Flow: Kernel to Host Application

When a vat returns a result back to the host application:

```
Kernel Worker                               Host Application
     │                                           │
     │  1. Vat executes and returns result       │
     │     Format: CapData<KRef>                 │
     │                                           │
     │  2. Kernel resolves promise               │
     │     CapData<KRef> associated with kp      │
     │                                           │
     │  3. CapTP serializes result               │
     │     CapTP message with CapData payload    │
     │                                           │
     │  ◄─────── postMessage channel ─────────   │
     │                                           │
     │                                           │  4. CapTP delivers answer
     │                                           │     Result: CapData<KRef>
     │                                           │
     │                                           │  5. PresenceManager.fromCapData()
     │                                           │     slots['ko42'] → makeKrefPresence()
     │                                           │
     │                                           │  6. Host receives E()-callable objects
     │                                           │
```

### Step-by-Step Breakdown

1. **Vat returns result** - The vat executes the requested method and returns a result, which liveslots marshals into `CapData<KRef>` format.

2. **Kernel resolves promise** - The kernel associates the result with the kernel promise (`kp`) that represents the pending call.

3. **CapTP serializes** - CapTP marshals the result (which contains `CapData<KRef>`) for transport back to the host.

4. **CapTP delivers answer** - The host receives the CapTP answer message containing the `CapData<KRef>` result.

5. **PresenceManager converts** - `PresenceManager.fromCapData()` deserializes the result, converting kref slots into `E()`-callable presence objects.

6. **Host receives presences** - The host application receives JavaScript objects with presence objects that can be used with `E()` for further calls.

## Slot Types

The system uses two different slot naming schemes:

### CapTP Slots

Used by `@endo/captp` for cross-process object references:

| Prefix | Meaning                             |
| ------ | ----------------------------------- |
| `o+N`  | Exported object (positive = export) |
| `o-N`  | Imported object (negative = import) |
| `p+N`  | Exported promise                    |
| `p-N`  | Imported promise                    |

### Kernel Slots (KRefs)

Used by the kernel for internal object tracking:

| Prefix | Meaning        |
| ------ | -------------- |
| `ko`   | Kernel object  |
| `kp`   | Kernel promise |
| `kd`   | Kernel device  |
| `v`    | Vat reference  |

KRefs are globally unique within a kernel and survive across process restarts.

## Custom Conversion Functions

### `convertKrefsToStandins`

**Location:** `packages/ocap-kernel/src/kref-presence.ts`

**Direction:** Outbound (host to kernel)

**Purpose:** Transforms kref strings into `kslot()` Exo remotable objects that CapTP can serialize.

```typescript
// Input
{ target: 'ko42', data: { ref: 'ko43' } }

// Output
{ target: <Remotable kslot('ko42')>, data: { ref: <Remotable kslot('ko43')> } }
```

### `convertPresencesToStandins`

**Location:** `packages/ocap-kernel/src/kref-presence.ts`

**Direction:** Outbound (host to kernel)

**Purpose:** Combines presence-to-kref and kref-to-standin conversions. Transforms presence objects directly into standins.

### `PresenceManager.fromCapData`

**Location:** `packages/ocap-kernel/src/kref-presence.ts`

**Direction:** Inbound (kernel to host)

**Purpose:** Deserializes `CapData<KRef>` into JavaScript objects with `E()`-callable presences.

```typescript
// Input: CapData<KRef>
{ body: '{"@qclass":"slot","index":0}', slots: ['ko42'] }

// Output
<Presence for ko42, callable via E()>
```

## Supported Data Types

The serialization pipeline supports JSON-compatible data types plus special object-capability types:

### Supported

- Primitives: `string`, `number`, `boolean`, `null`, `undefined`
- Collections: `Array`, plain `Object`
- Special: `BigInt`, `Symbol` (well-known only)
- OCap types: Remotable objects, Promises

### Not Supported

- `CopyTagged` objects (custom tagged data) - not supported in this pipeline
- Circular references
- Functions (except as part of Remotable objects)
- DOM objects, Buffers, or other platform-specific types

### Important Notes

1. All data passing through the pipeline must be JSON-serializable at its core
2. Object references are converted to slot strings and back, not passed directly
3. Promises are tracked by the kernel and resolved asynchronously
4. Remotable objects become presences that queue messages rather than invoking methods directly

## Why Two Levels of Marshaling?

```
Host Process                          Kernel Worker
     │                                     │
     │  CapTP marshal                      │  Kernel marshal
     │  (o+/p+ slots)                      │  (ko/kp slots)
     │                                     │
     └────────── postMessage ──────────────┘
                     │
               JSON transport
```

The two-level marshaling serves distinct purposes:

- **CapTP marshal**: Provides a general-purpose RPC mechanism for cross-process object passing. It knows nothing about kernel internals and uses its own slot numbering.

- **Kernel marshal**: Handles kernel-specific concerns like persistent object identity, vat isolation, and garbage collection. KRefs must be stable across kernel restarts.

The separation allows the kernel to use any transport mechanism (not just CapTP) while maintaining consistent internal object references.
