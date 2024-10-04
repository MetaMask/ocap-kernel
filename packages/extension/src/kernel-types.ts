/**
 * A structured representation of an ocap kernel.
 */
type Queue<Type> = Type[];

type VatId = `v${number}`;
type RemoteId = `r${number}`;
type EndpointId = VatId | RemoteId;

type RefTypeTag = 'o' | 'p';
type RefDirectionTag = '+' | '-';
type InnerKRef = `${RefTypeTag}${number}`;
type InnerERef = `${RefTypeTag}${RefDirectionTag}${number}`;

type KRef = `k${InnerKRef}`;
type VRef = `v${InnerERef}`;
type RRef = `r${InnerERef}`;
type ERef = VRef | RRef;

type CapData = {
  body: string;
  slots: string[];
};

type Message = {
  target: ERef | KRef;
  method: string;
  params: CapData;
};

// Per-endpoint persistent state
type EndpointState<IdType> = {
  name: string;
  id: IdType;
  nextExportObjectIdCounter: number;
  nextExportPromiseIdCounter: number;
  eRefToKRef: Map<ERef, KRef>;
  kRefToERef: Map<KRef, ERef>;
};

type VatState = {
  messagePort: MessagePort;
  state: EndpointState<VatId>;
  source: string;
  kvTable: Map<string, string>;
};

type RemoteState = {
  state: EndpointState<RemoteId>;
  connectToURL: string;
  // more here about maintaining connection...
};

// Kernel persistent state
type KernelObject = {
  owner: EndpointId;
  reachableCount: number;
  recognizableCount: number;
};

type PromiseState = 'unresolved' | 'fulfilled' | 'rejected';

type KernelPromise = {
  decider: EndpointId;
  state: PromiseState;
  referenceCount: number;
  messageQueue: Queue<Message>;
  value: undefined | CapData;
};

// export temporarily to shut up lint whinges about unusedness
export type KernelState = {
  runQueue: Queue<Message>;
  nextVatIdCounter: number;
  vats: Map<VatId, VatState>;
  nextRemoteIdCounter: number;
  remotes: Map<RemoteId, RemoteState>;
  nextKernelObjectIdCounter: number;
  kernelObjects: Map<KRef, KernelObject>;
  nextKernePromiseIdCounter: number;
  kernelPromises: Map<KRef, KernelPromise>;
};
