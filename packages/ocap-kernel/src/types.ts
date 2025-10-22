import type {
  SwingSetCapData,
  Message as SwingsetMessage,
  VatSyscallObject,
  VatSyscallSend,
  VatOneResolution,
} from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import type { VatCheckpoint } from '@metamask/kernel-store';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import type { DuplexStream } from '@metamask/streams';
import {
  define,
  is,
  object,
  string,
  array,
  record,
  union,
  tuple,
  literal,
  boolean,
  exactOptional,
  type,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import { UnsafeJsonStruct } from '@metamask/utils';
import type { PlatformConfig } from '@ocap/kernel-platforms';
import { platformConfigStruct } from '@ocap/kernel-platforms';

import { Fail } from './utils/assert.ts';

export type VatId = string;
export type RemoteId = string;
export type EndpointId = VatId | RemoteId;
export type SubclusterId = string;

export type KRef = string;
export type VRef = string;
export type RRef = string;
export type ERef = VRef | RRef;
export type Ref = KRef | ERef;

export const ROOT_OBJECT_VREF: VRef = 'o+0';

export const CapDataStruct = object({
  body: string(),
  slots: array(string()),
});

export const VatOneResolutionStruct = tuple([
  string(),
  boolean(),
  CapDataStruct,
]);

export const MessageStruct = object({
  methargs: CapDataStruct,
  result: exactOptional(union([string(), literal(null)])),
});

/**
 * JSON-RPC-compatible Message type, originally from @agoric/swingset-liveslots.
 */
export type Message = Infer<typeof MessageStruct>;

/**
 * Coerce a {@link SwingsetMessage} to our own JSON-RPC-compatible {@link Message}.
 *
 * @param message - The SwingsetMessage to coerce.
 * @returns The coerced Message.
 */
export function coerceMessage(message: SwingsetMessage): Message {
  if (message.result === undefined) {
    delete (message as Message).result;
  }
  return message as Message;
}

type JsonVatSyscallObject =
  | Exclude<VatSyscallObject, VatSyscallSend>
  | ['send', string, Message];

/**
 * Coerce a {@link VatSyscallObject} to a JSON-RPC-compatible {@link JsonVatSyscallObject}.
 *
 * @param vso - The VatSyscallObject to coerce.
 * @returns The coerced VatSyscallObject.
 */
export function coerceVatSyscallObject(
  vso: VatSyscallObject,
): JsonVatSyscallObject {
  if (vso[0] === 'send') {
    return ['send', vso[1], coerceMessage(vso[2])];
  }
  return vso as JsonVatSyscallObject;
}

const RunQueueItemSendStruct = object({
  type: literal('send'),
  target: string(), // KRef
  message: MessageStruct,
});

export type RunQueueItemSend = Infer<typeof RunQueueItemSendStruct>;

const RunQueueItemNotifyStruct = object({
  type: literal('notify'),
  endpointId: string(),
  kpid: string(),
});

export type RunQueueItemNotify = Infer<typeof RunQueueItemNotifyStruct>;

const GCRunQueueTypeStruct = union([
  literal('dropExports'),
  literal('retireExports'),
  literal('retireImports'),
]);

export type GCRunQueueType = Infer<typeof GCRunQueueTypeStruct>;

export type GCActionType = 'dropExport' | 'retireExport' | 'retireImport';
export const actionTypePriorities: GCActionType[] = [
  'dropExport',
  'retireExport',
  'retireImport',
];

const RunQueueItemGCActionStruct = object({
  type: GCRunQueueTypeStruct,
  endpointId: string(), // EndpointId
  krefs: array(string()), // KRefs
});

export type RunQueueItemGCAction = Infer<typeof RunQueueItemGCActionStruct>;

const RunQueueItemBringOutYourDeadStruct = object({
  type: literal('bringOutYourDead'),
  endpointId: string(),
});

export type RunQueueItemBringOutYourDead = Infer<
  typeof RunQueueItemBringOutYourDeadStruct
>;

export const RunQueueItemStruct = union([
  RunQueueItemSendStruct,
  RunQueueItemNotifyStruct,
  RunQueueItemGCActionStruct,
  RunQueueItemBringOutYourDeadStruct,
]);

export type RunQueueItem = Infer<typeof RunQueueItemStruct>;

/**
 * Assert that a value is a valid message.
 *
 * @param value - The value to check.
 * @throws if the value is not a valid message.
 */
export function insistMessage(value: unknown): asserts value is Message {
  is(value, MessageStruct) || Fail`not a valid message`;
}

// Per-endpoint persistent state
type EndpointState<IdType> = {
  name: string;
  id: IdType;
  nextExportObjectIdCounter: number;
  nextExportPromiseIdCounter: number;
  eRefToKRef: Map<ERef, KRef>;
  kRefToERef: Map<KRef, ERef>;
};

type KernelVatState = {
  messagePort: typeof MessagePort;
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

export type PromiseState = 'unresolved' | 'fulfilled' | 'rejected';

export type KernelPromise = {
  state: PromiseState;
  decider?: EndpointId;
  subscribers?: EndpointId[];
  value?: CapData<KRef>;
};

export type KernelState = {
  vats: Map<VatId, KernelVatState>;
  remotes: Map<RemoteId, RemoteState>;
  kernelPromises: Map<KRef, KernelPromise>;
};

export const isVatId = (value: unknown): value is VatId =>
  typeof value === 'string' &&
  value.at(0) === 'v' &&
  value.slice(1) === String(Number(value.slice(1)));

export const isRemoteId = (value: unknown): value is RemoteId =>
  typeof value === 'string' &&
  value.at(0) === 'r' &&
  value.slice(1) === String(Number(value.slice(1)));

export const isEndpointId = (value: unknown): value is EndpointId =>
  typeof value === 'string' &&
  (value.at(0) === 'v' || value.at(0) === 'r') &&
  value.slice(1) === String(Number(value.slice(1)));

/**
 * Assert that a value is a valid vat id.
 *
 * @param value - The value to check.
 * @throws if the value is not a valid vat id.
 */
export function insistVatId(value: unknown): asserts value is VatId {
  isVatId(value) || Fail`not a valid VatId ${value}`;
}

/**
 * Assert that a value is a valid endpoint id.
 *
 * @param value - The value to check.
 * @throws if the value is not a valid endpoint id.
 */
export function insistEndpointId(value: unknown): asserts value is EndpointId {
  isEndpointId(value) || Fail`not a valid EndpointId`;
}

export const VatIdStruct = define<VatId>('VatId', isVatId);

export const isSubclusterId = (value: unknown): value is SubclusterId =>
  typeof value === 'string' &&
  value.at(0) === 's' &&
  value.slice(1) === String(Number(value.slice(1)));

export const SubclusterIdStruct = define<SubclusterId>(
  'SubclusterId',
  isSubclusterId,
);

export type VatMessageId = `m${number}`;

export const isVatMessageId = (value: unknown): value is VatMessageId =>
  typeof value === 'string' &&
  value.at(0) === 'm' &&
  value.slice(1) === String(Number(value.slice(1)));

export const VatMessageIdStruct = define<VatMessageId>(
  'VatMessageId',
  isVatMessageId,
);

export type RemoteMessageHandler = (
  from: string,
  message: string,
) => Promise<string>;

/**
 * A service for things the kernel worker can't do itself. Abstracts platform-specific details of
 * how vat workers are launched, terminated, and connected to the kernel, and for network communications.
 */
export type PlatformServices = {
  /**
   * Launch a new worker with a specific vat id.
   *
   * @param vatId - The vat id of the worker to launch.
   * @param vatConfig - Configuration object describing vat.
   * @returns A promise for a duplex stream connected to the worker
   * which rejects if a worker with the given vat id already exists.
   */
  launch: (
    vatId: VatId,
    vatConfig: VatConfig,
  ) => Promise<DuplexStream<JsonRpcMessage, JsonRpcMessage>>;
  /**
   * Terminate a worker identified by its vat id.
   *
   * @param vatId - The vat id of the worker to terminate.
   * @param error - An optional error to terminate the worker with.
   * @returns A promise that resolves when the worker has terminated
   * or rejects if that worker does not exist.
   */
  terminate: (vatId: VatId, error?: Error) => Promise<void>;
  /**
   * Terminate all workers managed by the service.
   *
   * @returns A promise that resolves after all workers have terminated
   * or rejects if there was an error during termination.
   */
  terminateAll: () => Promise<void>;

  /**
   * Send a message over the network to another kernel.
   *
   * @param to - The network peer to whom to send the message.
   * @param message - The message itself.
   * @param hints - Possible addresses at which the `to` peer might be contacted.
   * @returns A promise that resolves when the message has been transmitted or
   *   rejects if there is some problem doing so.
   */
  sendRemoteMessage: (
    to: string,
    message: string,
    hints?: string[],
  ) => Promise<void>;
  /**
   * Initialize network communications.
   *
   * @param keySeed - The seed for generating this kernel's secret key.
   * @param knownRelays - Array of the peerIDs of relay nodes that can be used to listen for incoming
   *   connections from other kernels.
   * @param remoteMessageHandler - A handler function to receive remote messages.
   * @returns A promise that resolves once network access has been established
   *   or rejects if there is some problem doing so.
   */
  initializeRemoteComms: (
    keySeed: string,
    knownRelays: string[],
    remoteMessageHandler: RemoteMessageHandler,
  ) => Promise<void>;
};

export type SendRemoteMessage = (
  to: string,
  message: string,
  hints?: string[],
) => Promise<void>;

export type RemoteComms = {
  getPeerId: () => string;
  sendRemoteMessage: SendRemoteMessage;
  issueOcapURL: (kref: string) => Promise<string>;
  redeemLocalOcapURL: (ocapURL: string) => Promise<string>;
};

export type RemoteInfo = {
  peerId: string;
  hints?: string[];
};

// Cluster configuration

export type VatConfig = UserCodeSpec & {
  creationOptions?: Record<string, Json>;
  parameters?: Record<string, Json>;
  platformConfig?: Partial<PlatformConfig>;
};

const UserCodeSpecStruct = union([
  object({
    sourceSpec: string(),
  }),
  object({
    bundleSpec: string(),
  }),
  object({
    bundleName: string(),
  }),
]);

type UserCodeSpec = Infer<typeof UserCodeSpecStruct>;

export const VatConfigStruct = define<VatConfig>('VatConfig', (value) => {
  if (!value) {
    return false;
  }

  const { creationOptions, parameters, platformConfig, ...specOnly } =
    value as Record<string, unknown>;

  return (
    is(specOnly, UserCodeSpecStruct) &&
    (!creationOptions || is(creationOptions, UnsafeJsonStruct)) &&
    (!parameters || is(parameters, UnsafeJsonStruct)) &&
    (!platformConfig || is(platformConfig, platformConfigStruct))
  );
});

export const isVatConfig = (value: unknown): value is VatConfig =>
  is(value, VatConfigStruct);

export type VatConfigTable = Record<string, VatConfig>;

export const ClusterConfigStruct = object({
  bootstrap: string(),
  forceReset: exactOptional(boolean()),
  services: exactOptional(array(string())),
  vats: record(string(), VatConfigStruct),
  bundles: exactOptional(record(string(), VatConfigStruct)),
});

export type ClusterConfig = Infer<typeof ClusterConfigStruct>;

export const isClusterConfig = (value: unknown): value is ClusterConfig =>
  is(value, ClusterConfigStruct);

export const SubclusterStruct = object({
  id: SubclusterIdStruct,
  config: ClusterConfigStruct,
  vats: array(VatIdStruct),
});

export type Subcluster = Infer<typeof SubclusterStruct>;

export const KernelStatusStruct = type({
  subclusters: array(SubclusterStruct),
  vats: array(
    object({
      id: VatIdStruct,
      config: VatConfigStruct,
      subclusterId: SubclusterIdStruct,
    }),
  ),
  remoteComms: exactOptional(
    object({
      isInitialized: boolean(),
      peerId: exactOptional(string()),
    }),
  ),
});

export type KernelStatus = Infer<typeof KernelStatusStruct>;

export type UserCodeStartFn = (parameters?: Record<string, Json>) => object;

/**
 * A mapping of GC action type to queue event type.
 */
export const queueTypeFromActionType = new Map<GCActionType, GCRunQueueType>([
  // Note: From singular to plural
  ['dropExport', 'dropExports'],
  ['retireExport', 'retireExports'],
  ['retireImport', 'retireImports'],
]);

export const isGCActionType = (value: unknown): value is GCActionType =>
  actionTypePriorities.includes(value as GCActionType);

/**
 * Assert that a value is a valid GC action type.
 *
 * @param value - The value to check.
 * @throws if the value is not a valid GC action type.
 */
export function insistGCActionType(
  value: unknown,
): asserts value is GCActionType {
  isGCActionType(value) || Fail`not a valid GCActionType ${value}`;
}

export type GCAction = `${EndpointId} ${GCActionType} ${KRef}`;

export const GCActionStruct = define<GCAction>('GCAction', (value: unknown) => {
  if (typeof value !== 'string') {
    return false;
  }
  const [endpointId, actionType, kref] = value.split(' ');
  if (!isEndpointId(endpointId)) {
    return false;
  }
  if (!isGCActionType(actionType)) {
    return false;
  }
  if (typeof kref !== 'string' || !kref.startsWith('ko')) {
    return false;
  }
  return true;
});

export const isGCAction = (value: unknown): value is GCAction =>
  is(value, GCActionStruct);

export type CrankResults = {
  didDelivery?: EndpointId; // the endpoint to which we made a delivery
  abort?: boolean; // changes should be discarded, not committed
  terminate?: { vatId: VatId; reject: boolean; info: SwingSetCapData };
};

export type VatDeliveryResult = [VatCheckpoint, string | null];

export type EndpointHandle = {
  deliverMessage: (target: ERef, message: Message) => Promise<CrankResults>;
  deliverNotify: (resolutions: VatOneResolution[]) => Promise<CrankResults>;
  deliverDropExports: (erefs: ERef[]) => Promise<CrankResults>;
  deliverRetireExports: (erefs: ERef[]) => Promise<CrankResults>;
  deliverRetireImports: (erefs: ERef[]) => Promise<CrankResults>;
  deliverBringOutYourDead: () => Promise<CrankResults>;
};
