import type {
  SwingSetCapData,
  Message as SwingsetMessage,
  VatSyscallObject,
  VatSyscallResult,
  VatSyscallSend,
  VatOneResolution,
  VatDeliveryObject,
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
  RemoteCommsOptions,
} from './remotes/types.ts';
import { Fail } from './utils/assert.ts';

export type VatId = string;
export type RemoteId = string;
export type SystemVatId = `sv${number}`;
export type EndpointId = VatId | RemoteId | SystemVatId;
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

export const isSystemVatId = (value: unknown): value is SystemVatId =>
  typeof value === 'string' &&
  value.startsWith('sv') &&
  value.slice(2) === String(Number(value.slice(2)));

export const isEndpointId = (value: unknown): value is EndpointId =>
  isVatId(value) || isRemoteId(value) || isSystemVatId(value);

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
export const SystemVatIdStruct = define<SystemVatId>(
  'SystemVatId',
  isSystemVatId,
);

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
   * @returns A promise that resolves once network access has been established
   *   or rejects if there is some problem doing so.
   */
  initializeRemoteComms: (
    keySeed: string,
    options: RemoteCommsOptions,
    remoteMessageHandler: RemoteMessageHandler,
    onRemoteGiveUp?: OnRemoteGiveUp,
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

/**
 * Function signature for building the root object of a system vat.
 * System vats don't load bundles; they provide this function directly.
 */
export type SystemVatBuildRootObject = (
  vatPowers: Record<string, unknown>,
  parameters: Record<string, Json> | undefined,
) => object;

/**
 * Configuration for a single system vat within a system subcluster.
 * Used when launching system subclusters via Kernel.launchSystemSubcluster().
 */
export type SystemVatConfig = {
  buildRootObject: SystemVatBuildRootObject;
  parameters?: Record<string, Json>;
};

/**
 * Configuration for launching a system subcluster.
 * System subclusters contain vats that run without compartment isolation
 * directly in the host process.
 *
 * Used when launching system subclusters via Kernel.launchSystemSubcluster().
 */
export type SystemSubclusterConfig = {
  /** The name of the bootstrap vat within the subcluster. */
  bootstrap: string;
  /** Map of vat names to their configurations. */
  vats: Record<string, SystemVatConfig>;
  /** Optional list of kernel service names to provide to the bootstrap vat. */
  services?: string[];
};

// ============================================================================
// System Vat Transport Types
// ============================================================================

/**
 * Syscall handler from system vat to kernel.
 * The kernel provides this to the transport so syscalls can be routed correctly.
 */
export type SystemVatSyscallHandler = (
  syscall: VatSyscallObject,
) => VatSyscallResult;

/**
 * Deliver function from kernel to system vat.
 * The runtime provides this to the kernel so deliveries can be routed correctly.
 */
export type SystemVatDeliverFn = (
  delivery: VatDeliveryObject,
) => Promise<string | null>;

/**
 * Transport interface bridging kernel and system vat processes.
 *
 * The transport abstracts the communication channel between the kernel (which
 * creates SystemVatHandle) and the system vat supervisor (which runs in the
 * runtime's process). This allows:
 * - Node.js: direct function calls (same process)
 * - Extension: MessagePort IPC (cross-process)
 *
 * The kernel is passive - it sets up to receive connections via the transport.
 * The supervisor side initiates the connection by resolving `awaitConnection()`.
 * This push-based model allows:
 * - Same-process: supervisor calls `connect()` which resolves the promise
 * - Cross-process: supervisor sends "connect" message over IPC
 */
export type SystemVatTransport = {
  /** Send deliveries from kernel to system vat. */
  deliver: SystemVatDeliverFn;
  /** Register syscall handler (kernel calls this to wire up). */
  setSyscallHandler: (handler: SystemVatSyscallHandler) => void;
  /**
   * Returns a promise that resolves when the supervisor-side initiates
   * connection. The kernel waits for this before sending bootstrap messages.
   * For same-process transports, this resolves when `connect()` is called.
   * For cross-process transports, this resolves when "connect" IPC message arrives.
   */
  awaitConnection: () => Promise<void>;
};

/**
 * Configuration for a static system vat (declared at kernel construction).
 * The runtime creates the supervisor and provides the transport.
 */
export type StaticSystemVatConfig = {
  /** Vat name (used in bootstrap message). */
  name: string;
  /** Transport callbacks for communication. */
  transport: SystemVatTransport;
  /** Optional kernel services to provide to the vat. */
  services?: string[];
};

/**
 * Configuration for a dynamic system vat (registered at runtime via kernel facet).
 * Used by UIs and other components that connect after kernel initialization.
 */
export type DynamicSystemVatConfig = {
  /** Vat name (used in bootstrap message). */
  name: string;
  /** Transport callbacks for communication. */
  transport: SystemVatTransport;
  /** Optional kernel services to provide to the vat. */
  services?: string[];
};

/**
 * Result of registering a dynamic system vat.
 */
export type SystemVatRegistrationResult = {
  /** The allocated system vat ID. */
  systemVatId: SystemVatId;
  /** The kref of the vat's root object. */
  rootKref: KRef;
  /** Function to disconnect and clean up the vat. */
  disconnect: () => Promise<void>;
};

/**
 * System vats configuration for Kernel.make().
 * List of static system vats to connect at kernel creation time.
 */
export type KernelSystemVatsConfig = {
  vats: StaticSystemVatConfig[];
};

export const SubclusterStruct = object({
  id: SubclusterIdStruct,
  config: ClusterConfigStruct,
  vats: array(VatIdStruct),
});

export type Subcluster = Infer<typeof SubclusterStruct>;

/**
 * Result of launching a subcluster.
 */
export type SubclusterLaunchResult = {
  /** The ID of the launched subcluster. */
  subclusterId: string;
  /** The kref of the bootstrap vat's root object. */
  bootstrapRootKref: KRef;
  /** The CapData result of calling bootstrap() on the root object, if any. */
  bootstrapResult: CapData<KRef> | undefined;
};

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
  terminate?: { vatId: EndpointId; reject: boolean; info: SwingSetCapData };
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
