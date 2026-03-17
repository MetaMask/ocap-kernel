# Glossary

## Concepts

### kernel

A centralized manager of [vats](#vat) and [distributed objects](#distributed-object). See
the [Kernel](../packages/ocap-kernel/src/Kernel.ts) class.

### vat

A unit of compute managed by the [kernel](#kernel). See the
[VatHandle](../packages/ocap-kernel/src/VatHandle.ts) and
[VatSupervisor](../packages/ocap-kernel/src/VatSupervisor.ts) classes.

### baggage

Persistent key-value storage for a [vat's](#vat) durable state. Baggage survives vat
restarts (resuscitation) and is the primary mechanism for vat state persistence. Baggage
is provided as the third argument to `buildRootObject`.

### bootstrap

The initialization method called on the bootstrap [vat's](#vat) root object when a
[subcluster](#subcluster) is first launched. The bootstrap method receives references to
other vats and [kernel services](#kernel-service) and is called exactly once — it is not
called again after a vat restart.

### cluster

See [subcluster](#subcluster).

### exo

A remotable object created with `makeDefaultExo()` from `@metamask/kernel-utils/exo`. Exos
are the standard way to create objects that can be passed between [vats](#vat), stored in
[baggage](#baggage), and invoked via `E()`. Do not use `Far()` from `@endo/far`.

### distributed object

A persistent object residing in a [vat](#vat) and asynchronously accessible to other vats.
See the [implementation](../packages/ocap-kernel/src/store/methods/object.ts) in the
kernel's storage methods.

### kernel service

An object registered with the [kernel](#kernel) that [vats](#vat) can invoke via `E()`.
Kernel services run in the kernel's own context (not in a vat) and are registered using
`kernel.registerKernelServiceObject()`. Because service implementations do not participate
in the kernel's reference management, they cannot return [exos](#exo). Services marked
`systemOnly` can only be accessed by [system subclusters](#system-subcluster). See the
[KernelServiceManager](../packages/ocap-kernel/src/KernelServiceManager.ts).

### supervisor

A kernel-space component that manages the lifecycle and communication of a [vat](#vat).
The [VatSupervisor](../packages/ocap-kernel/src/VatSupervisor.ts) handles [message
delivery](#delivery), [syscalls](#syscall), and vat initialization.

### liveslots

A framework for managing object lifecycles within [vats](#vat). Liveslots provides the
runtime environment for vat code and handles object persistence, promise management, and
[syscall](#syscall) coordination.

### crank

A single execution cycle in the kernel's [run queue](#run-queue). Each crank processes one
item from the run queue, delivering a single message or notification to [a vat](#vat).
Cranks can be aborted and rolled back if errors occur. See the
[KernelQueue](../packages/ocap-kernel/src/KernelQueue.ts) for the run loop implementation.

### syscall

A system call made by a [vat](#vat) to request kernel services. Syscalls include
operations like sending messages, resolving [promises](#promise-resolution), and accessing
persistent storage. See [VatSyscall](../packages/ocap-kernel/src/VatSyscall.ts) and the
[syscall service](../packages/ocap-kernel/src/services/syscall.ts).

### delivery

The process of sending a message or notification to a [vat](#vat) in a [crank](#crank).
Deliveries can be of type 'message', 'notify', 'dropExports', 'retireExports',
'retireImports', or 'bringOutYourDead'. See the [kernel router](#kernel-router)
([KernelRouter](../packages/ocap-kernel/src/KernelRouter.ts)) for delivery logic.

### marshaling

The process of serializing and deserializing data for transmission between [vats](#vat).
The kernel uses marshaling to convert object references and data structures into a format
suitable for cross-vat communication. See the [kernel marshal
service](../packages/ocap-kernel/src/services/kernel-marshal.ts) for `kser` and `kunser`
functions.

### promise resolution

The process of fulfilling or rejecting a promise. Promise resolutions are delivered as
notifications to [vats](#vat) and can trigger cascading resolutions of dependent promises.
See the [promise store methods](../packages/ocap-kernel/src/store/methods/promise.ts) for
implementation details.

### garbage collection (GC)

The process of identifying and cleaning up unreachable objects. The kernel performs GC by
tracking reference counts and delivering appropriate notifications to [vats](#vat).
**Important**: the garbage collection systems of the kernel, liveslots, and javascript are
all mutually independent. See the [GC
methods](../packages/ocap-kernel/src/store/methods/gc.ts) and [GC
service](../packages/ocap-kernel/src/services/garbage-collection.ts) for implementation
details.

### revocation

The process of invalidating an object reference, preventing further access to the object.
Revoked objects return errors when accessed. See the [revocation
methods](../packages/ocap-kernel/src/store/methods/revocation.ts) for implementation.

### channel

A communication pathway between different components, such as between a [vat](#vat) and
the [kernel](#kernel), or between different [clusters](#cluster). Channels use
[streams](#stream) for message passing. See the
[BaseDuplexStream](../packages/streams/src/BaseDuplexStream.ts) for the core channel
implementation.

### stream

A remote asynchronous iterator that provides bidirectional communication between
components. Streams implement the `Reader` interface from `@endo/stream` and can be used
for message passing between [vats](#vat), kernel components, and external systems. See the
[BaseDuplexStream](../packages/streams/src/BaseDuplexStream.ts) for bidirectional
streams.

### subcluster

A logically related group of [vats](#vat), intended to be operated together. Defined by a
`ClusterConfig`. When a subcluster is launched, all its vats start and the
[bootstrap](#bootstrap) vat receives references to the other vats. See the `ClusterConfig`
type in [`packages/ocap-kernel/src/types.ts`](../packages/ocap-kernel/src/types.ts).

### system subcluster

A [subcluster](#subcluster) declared at [kernel](#kernel) initialization that can access
privileged (`systemOnly`) [kernel services](#kernel-service). System subclusters persist
across kernel restarts and are identified by a unique name. See the
[SubclusterManager](../packages/ocap-kernel/src/SubclusterManager.ts).

### run queue

The kernel's main execution queue that processes messages, notifications, and [garbage
collection](#garbage-collection-gc) actions. Each [crank](#crank) processes one item from
this queue. See the [KernelQueue](../packages/ocap-kernel/src/KernelQueue.ts) class and
[queue methods](../packages/ocap-kernel/src/store/methods/queue.ts) for implementation
details.

### kernel router

The component responsible for routing messages to the correct [vat](#vat) based on target
references and promise states. The router handles [delivery](#delivery) logic. See the
[KernelRouter](../packages/ocap-kernel/src/KernelRouter.ts) for routing logic.

## Abbreviations

### clist

A _clist_ (short for "capability list") is a bidirectional mapping between short,
channel-specific identifiers and actual object references. The clist is unique to a
channel-runtime pair, and translates between the javascript runtime which holds the object
references and the channel which communicates about them.

### eref

An _ERef_ (short for "endpoint reference") is a generic term for a ref which is either a
[vref](#vref) or an [rref](#rref).

### kref

A _KRef_ (short for "kernel reference") designates an Object within the scope of the
Kernel itself. It is used in the translation of References between one Vat and another. A
KRef is generated and assigned by the Kernel whenever an Object reference is imported into
or exported from a Vat for the first time.

### rref

An _RRef_ (short for "remote reference") designates an object within the scope of an
established point-to-point communications [Channel](#channel) between two Clusters. An
RRef does not survive the Channel it is associated with. An RRef is generated when the
Kernel for one Cluster exports an Object Reference into the Channel connecting it to
another Cluster's Kernel.

### vref

A _VRef_ (short for "vat reference") designates an Object within the scope of the Objects
known to a particular Vat. It is used across the Kernel/Vat boundary in the marshaling of
messages delivered into or sent by that Vat. A VRef is generated and assigned by the
Kernel when importing an Object Reference into a Vat for the first time and by the Vat
when exporting an Object Reference from it for the first time.
