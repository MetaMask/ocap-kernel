export type VatId = `v${string}`;
export type RemoteId = `r${string}`;
export type EndpointId = VatId | RemoteId;

type RefTypeTag = 'o' | 'p';
type RefDirectionTag = '+' | '-';
type InnerKRef = `${RefTypeTag}${string}`;
type InnerERef = `${RefTypeTag}${RefDirectionTag}${string}`;

export type KRef = `k${InnerKRef}`;
export type VRef = `v${InnerERef}`;
export type RRef = `r${InnerERef}`;
export type ERef = VRef | RRef;

type CapData = {
  body: string;
  slots: string[];
};

export type Message = {
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
export type KernelObject = {
  owner: EndpointId;
  reachableCount: number;
  recognizableCount: number;
};

type PromiseState = 'unresolved' | 'fulfilled' | 'rejected';

export type KernelPromise = {
  decider: EndpointId;
  state: PromiseState;
  referenceCount: number;
  value: undefined | CapData;
};

export type KernelState = {
  vats: Map<VatId, VatState>;
  remotes: Map<RemoteId, RemoteState>;
  kernelObjects: Map<KRef, KernelObject>;
  kernelPromises: Map<KRef, KernelPromise>;
};
