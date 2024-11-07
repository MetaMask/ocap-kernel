import type { PromiseKit } from '@endo/promise-kit';
import {
  define,
  is,
  never,
  object,
  optional,
  string,
  union,
} from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import { UnsafeJsonStruct } from '@metamask/utils';
import type { StreamMultiplexer } from '@ocap/streams';

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
  value?: CapData;
};

export type KernelState = {
  vats: Map<VatId, VatState>;
  remotes: Map<RemoteId, RemoteState>;
  kernelPromises: Map<KRef, KernelPromise>;
};

export const isVatId = (value: unknown): value is VatId =>
  typeof value === 'string' &&
  value.at(0) === 'v' &&
  value.slice(1) === String(Number(value.slice(1)));

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

export type PromiseCallbacks<Resolve = unknown> = Omit<
  PromiseKit<Resolve>,
  'promise'
>;

export type VatWorkerService = {
  /**
   * Launch a new worker with a specific vat id.
   *
   * @param vatId - The vat id of the worker to launch.
   * @param vatConfig - Configuration object describing vat.
   * @returns A promise for a duplex stream connected to the worker
   * which rejects if a worker with the given vat id already exists.
   */
  launch: (vatId: VatId, vatConfig: VatConfig) => Promise<StreamMultiplexer>;
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

  const { sourceSpec, bundleSpec, bundleName, creationOptions, parameters } =
    value as Record<string, unknown>;
  const specOnly = { sourceSpec, bundleSpec, bundleName };

  return (
    is(specOnly, UserCodeSpecStruct) &&
    (!creationOptions || is(creationOptions, UnsafeJsonStruct)) &&
    (!parameters || is(parameters, UnsafeJsonStruct))
  );
});

export const isVatConfig = (value: unknown): value is VatConfig =>
  is(value, VatConfigStruct);

export type VatConfigTable = Record<string, VatConfig>;

export type ClusterConfig = {
  bootstrap?: string;
  vats: VatConfigTable;
  bundles?: VatConfigTable;
};

export type UserCodeStartFn = (parameters?: Record<string, Json>) => object;
