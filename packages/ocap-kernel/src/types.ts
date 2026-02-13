import type {
  Baggage,
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

import type {
  RemoteMessageHandler,
  SendRemoteMessage,
  StopRemoteComms,
  OnRemoteGiveUp,
  OnIncarnationChange,
  RemoteCommsOptions,
} from './remotes/types.ts';
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
   * @returns A promise that resolves when the message has been transmitted or
   *   rejects if there is some problem doing so.
   */
  sendRemoteMessage: SendRemoteMessage;
  /**
   * Initialize network communications.
   *
   * @param keySeed - The seed for generating this kernel's secret key.
   * @param options - Options for remote communications initialization.
   * @param options.relays - Array of the peerIDs of relay nodes that can be used to listen for incoming
   *   connections from other kernels.
   * @param options.maxRetryAttempts - Maximum number of reconnection attempts. 0 = infinite (default).
   * @param options.maxQueue - Maximum number of messages to queue per peer while reconnecting (default: 200).
   * @param remoteMessageHandler - A handler function to receive remote messages.
   * @param onRemoteGiveUp - Optional callback to be called when we give up on a remote.
   * @param incarnationId - Unique identifier for this kernel instance.
   * @param onIncarnationChange - Optional callback when a remote peer's incarnation changes.
   * @returns A promise that resolves once network access has been established
   *   or rejects if there is some problem doing so.
   */
  initializeRemoteComms: (
    keySeed: string,
    options: RemoteCommsOptions,
    remoteMessageHandler: RemoteMessageHandler,
    onRemoteGiveUp?: OnRemoteGiveUp,
    incarnationId?: string,
    onIncarnationChange?: OnIncarnationChange,
  ) => Promise<void>;
  /**
   * Stop network communications.
   *
   * @returns A promise that resolves when network access has been stopped
   *   or rejects if there is some problem doing so.
   */
  stopRemoteComms: StopRemoteComms;
  /**
   * Explicitly close a connection to a peer.
   * Marks the peer as intentionally closed to prevent automatic reconnection.
   *
   * @param peerId - The peer ID to close the connection for.
   * @returns A promise that resolves when the connection is closed.
   */
  closeConnection: (peerId: string) => Promise<void>;
  /**
   * Take note of where a peer might be.
   *
   * @param peerId - The peer ID to which this information applies
   * @param hints - Location hints for the peer.
   */
  registerLocationHints: (peerId: string, hints: string[]) => Promise<void>;
  /**
   * Manually reconnect to a peer after intentional close.
   * Clears the intentional close flag and initiates reconnection.
   *
   * @param peerId - The peer ID to reconnect to.
   * @param hints - Optional hints for reconnection.
   * @returns A promise that resolves when reconnection is initiated.
   */
  reconnectPeer: (peerId: string, hints?: string[]) => Promise<void>;
  /**
   * Reset all reconnection backoffs.
   * Called after detecting a cross-incarnation wake to avoid unnecessary delays.
   *
   * @returns A promise that resolves when backoffs have been reset.
   */
  resetAllBackoffs: () => Promise<void>;
  /**
   * Get the listen addresses of the libp2p node.
   * Returns multiaddr strings that other peers can use to dial this node directly.
   * Returns an empty array if remote comms is not initialized.
   *
   * @returns The listen address strings.
   */
  getListenAddresses: () => string[];
};

// Cluster configuration

export type VatConfig = UserCodeSpec & {
  creationOptions?: Record<string, Json>;
  parameters?: Record<string, Json>;
  platformConfig?: Partial<PlatformConfig>;
  globals?: string[];
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

  const { creationOptions, parameters, platformConfig, globals, ...specOnly } =
    value as Record<string, unknown>;

  return (
    is(specOnly, UserCodeSpecStruct) &&
    (!creationOptions || is(creationOptions, UnsafeJsonStruct)) &&
    (!parameters || is(parameters, UnsafeJsonStruct)) &&
    (!platformConfig || is(platformConfig, platformConfigStruct)) &&
    (!globals || is(globals, array(string())))
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
  vats: record(string(), VatIdStruct),
});

export type Subcluster = Infer<typeof SubclusterStruct>;

/**
 * Result of launching a subcluster.
 */
export type SubclusterLaunchResult = {
  /** The ID of the launched subcluster. */
  subclusterId: string;
  /** The kref of the bootstrap vat's root object. */
  rootKref: KRef;
  /** The CapData result of calling bootstrap() on the root object, if any. */
  bootstrapResult: CapData<KRef> | undefined;
};

const RemoteCommsDisconnectedStruct = object({
  state: literal('disconnected'),
});

const RemoteCommsIdentityOnlyStruct = object({
  state: literal('identity-only'),
  peerId: string(),
});

const RemoteCommsConnectedStruct = object({
  state: literal('connected'),
  peerId: string(),
  listenAddresses: array(string()),
});

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
    union([
      RemoteCommsDisconnectedStruct,
      RemoteCommsIdentityOnlyStruct,
      RemoteCommsConnectedStruct,
    ]),
  ),
});

export type KernelStatus = Infer<typeof KernelStatusStruct>;

export type UserCodeStartFn = (parameters?: Record<string, Json>) => object;

/**
 * Capabilities provided to a vat. The contents vary by vat configuration.
 * Note: A logger is available via the `console` endowment.
 */
export type VatPowers = Record<string, unknown>;

/** Persistent storage for a vat's durable state (from @agoric/swingset-liveslots). */
export type { Baggage };

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

/**
 * Configuration for a system subcluster.
 * System subclusters are statically declared at kernel initialization and can
 * receive powerful kernel services not available to normal subclusters.
 * They persist across kernel restarts, just like regular subclusters.
 */
export type SystemSubclusterConfig = {
  /** Unique name for this system subcluster (used for retrieval via `getSystemSubclusterRoot`) */
  name: string;
  /** The cluster configuration */
  config: ClusterConfig;
};
