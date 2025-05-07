# Glossary

### kernel
A centralized manager of vats and distributed objects. See the [Kernel](../packages/ocap-kernel/src/Kernel.ts) class.

### vat
A unit of compute managed by the kernel. See the [VatHandle](../packages/ocap-kernel/src/VatHandle.ts) and [VatSupervisor](../packages/ocap-kernel/src/VatSupervisor.ts) classes.

### cluster
A logically related group of vats, intended to be operated together. See the `ClusterConfig` type in [`@ocap-kernel/src/types.ts`](../packages/ocap-kernel/src/types.ts).

### distributed object
A persistent object residing in a vat and asynchronously accessible to other vats. See the [implementation](../packages/ocap-kernel/src/store/methods/object.ts) in the kernel's storage methods.

## Abbreviations

### clist

A _clist_ (short for "capability list") is a bidirectional mapping between short, channel-specific identifiers and actual object references. The clist is unique to a channel-runtime pair, and translates between the javascript runtime which holds the object references and the channel which communicates about them.

### eref

An _ERef_ (short for "endpoint reference") is a generic term for a ref which is either a [vref](#vref) or an [rref](#rref).

### kref

A _KRef_ (short for "kernel reference") designates an Object within the scope of the Kernel itself. It is used in the translation of References between one Vat and another. A KRef is generated and assigned by the Kernel whenever an Object reference is imported into or exported from a Vat for the first time. KRefs are strictly internal to the Kernel implementation. The differentiation between VRefs and KRefs enables the Kernel to maintain `2N` Reference translation tables for `N` Vats rather than having to potentially maintain `N²` translation tables.

### rref

An _RRef_ (short for "remote reference") designates an object within the scope of an established point-to-point communications Channel between two Clusters (more on Channels below). An RRef does not survive the Channel it is associated with. An RRef is generated when the Kernel for one Cluster exports an Object Reference into the Channel connecting it to another Cluster's Kernel.

### vref

A _VRef_ (short for "vat reference") designates an Object within the scope of the Objects known to a particular Vat. It is used across the Kernel/Vat boundary in the marshaling of messages delivered into or sent by that Vat. A VRef is generated and assigned by the Kernel when importing an Object Reference into a Vat for the first time and by the Vat when exporting an Object Reference from it for the first time.

### vso

A vso, or _vat syscall object_, represents a request from a vat to the kernel.
