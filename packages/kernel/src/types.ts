import type { Message } from '@agoric/swingset-liveslots';
import { Fail } from '@endo/errors';
import type { CapData } from '@endo/marshal';
import {
  define,
  is,
  never,
  object,
  optional,
  string,
  array,
  record,
  union,
  tuple,
  map,
  set,
  literal,
  boolean,
  nullable,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import { UnsafeJsonStruct } from '@metamask/utils';
import type { DuplexStream } from '@ocap/streams';

import type { VatCommandReply, VatCommand } from './messages/vat.ts';

export type VatId = string;
export type RemoteId = string;
export type EndpointId = VatId | RemoteId;

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

export type RunQueueItemSend = {
  type: 'send';
  target: KRef;
  message: Message;
};

export type RunQueueItemNotify = {
  type: 'notify';
  vatId: VatId;
  kpid: KRef;
};

export type RunQueueItem = RunQueueItemSend | RunQueueItemNotify;

export const MessageStruct = object({
  methargs: CapDataStruct,
  result: union([string(), literal(undefined), literal(null)]),
});

export const insistMessage = (value: unknown): boolean =>
  is(value, MessageStruct) || Fail`not a valid message`;

const RunQueueItemType = {
  send: 'send',
  notify: 'notify',
  dropExports: 'dropExports',
  retireExports: 'retireExports',
  retireImports: 'retireImports',
  bringOutYourDead: 'bringOutYourDead',
} as const;

const RunQueueItemStructs = {
  [RunQueueItemType.send]: object({
    type: literal(RunQueueItemType.send),
    target: string(),
    message: MessageStruct,
  }),
  [RunQueueItemType.notify]: object({
    type: literal(RunQueueItemType.notify),
    vatId: string(),
    kpid: string(),
  }),
  [RunQueueItemType.dropExports]: object({
    type: literal(RunQueueItemType.dropExports),
  }),
  [RunQueueItemType.retireExports]: object({
    type: literal(RunQueueItemType.retireExports),
  }),
  [RunQueueItemType.retireImports]: object({
    type: literal(RunQueueItemType.retireImports),
  }),
  [RunQueueItemType.bringOutYourDead]: object({
    type: literal(RunQueueItemType.bringOutYourDead),
  }),
};

export const RunQueueItemStruct = union([
  RunQueueItemStructs.send,
  RunQueueItemStructs.notify,
  RunQueueItemStructs.dropExports,
  RunQueueItemStructs.retireExports,
  RunQueueItemStructs.retireImports,
  RunQueueItemStructs.bringOutYourDead,
]);

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

export const insistVatId = (value: unknown): boolean =>
  isVatId(value) || Fail`not a valid VatId`;

export const VatIdStruct = define<VatId>('VatId', isVatId);

export type VatMessageId = `m${number}`;

export const isVatMessageId = (value: unknown): value is VatMessageId =>
  typeof value === 'string' &&
  value.at(0) === 'm' &&
  value.slice(1) === String(Number(value.slice(1)));

export const VatMessageIdStruct = define<VatMessageId>(
  'VatMessageId',
  isVatMessageId,
);

export type VatWorkerService = {
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
  ) => Promise<DuplexStream<VatCommandReply, VatCommand>>;
  /**
   * Terminate a worker identified by its vat id.
   *
   * @param vatId - The vat id of the worker to terminate.
   * @returns A promise that resolves when the worker has terminated
   * or rejects if that worker does not exist.
   */
  terminate: (vatId: VatId) => Promise<void>;
  /**
   * Terminate all workers managed by the service.
   *
   * @returns A promise that resolves after all workers have terminated
   * or rejects if there was an error during termination.
   */
  terminateAll: () => Promise<void>;
};

// Cluster configuration

type UserCodeSpec =
  // Ugly but working hack, absent TypeScript having a genuine exclusive union construct.
  | {
      sourceSpec: string;
      bundleSpec?: never;
      bundleName?: never;
    }
  | {
      sourceSpec?: never;
      bundleSpec: string;
      bundleName?: never;
    }
  | {
      sourceSpec?: never;
      bundleSpec?: never;
      bundleName: string;
    };

export type VatConfig = UserCodeSpec & {
  creationOptions?: Record<string, Json>;
  parameters?: Record<string, Json>;
};

const UserCodeSpecStruct = union([
  object({
    sourceSpec: string(),
    bundleSpec: optional(never()),
    bundleName: optional(never()),
  }),
  object({
    sourceSpec: optional(never()),
    bundleSpec: string(),
    bundleName: optional(never()),
  }),
  object({
    sourceSpec: optional(never()),
    bundleSpec: optional(never()),
    bundleName: string(),
  }),
]);

export const VatConfigStruct = define<VatConfig>('VatConfig', (value) => {
  if (!value) {
    return false;
  }

  const { creationOptions, parameters, ...specOnly } = value as Record<
    string,
    unknown
  >;

  return (
    is(specOnly, UserCodeSpecStruct) &&
    (!creationOptions || is(creationOptions, UnsafeJsonStruct)) &&
    (!parameters || is(parameters, UnsafeJsonStruct))
  );
});

export const isVatConfig = (value: unknown): value is VatConfig =>
  is(value, VatConfigStruct);

export type VatConfigTable = Record<string, VatConfig>;

export const ClusterConfigStruct = object({
  bootstrap: string(),
  forceReset: nullable(boolean()),
  vats: record(string(), VatConfigStruct),
  bundles: nullable(record(string(), VatConfigStruct)),
});

export type ClusterConfig = Infer<typeof ClusterConfigStruct>;

export const isClusterConfig = (value: unknown): value is ClusterConfig =>
  is(value, ClusterConfigStruct);

export type UserCodeStartFn = (parameters?: Record<string, Json>) => object;

export type VatCheckpoint = [Map<string, string>, Set<string>];

export const VatCheckpointStruct = tuple([
  map(string(), string()),
  set(string()),
]);
