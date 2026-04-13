import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import {
  object,
  literal,
  optional,
  array,
  string,
  integer,
  min,
} from '@metamask/superstruct';
import type { Struct } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';
import type { RemoteCommsOptions } from '../../remotes/types.ts';

const initRemoteCommsParamsStruct = object({
  relays: optional(array(string())),
  directListenAddresses: optional(array(string())),
  maxRetryAttempts: optional(min(integer(), 0)),
  maxQueue: optional(min(integer(), 0)),
  maxUrlRelayHints: optional(min(integer(), 1)),
  maxKnownRelays: optional(min(integer(), 1)),
  allowedWsHosts: optional(array(string())),
});

// Superstruct's `optional()` infers `T | undefined` for each field, but
// `JsonRpcParams` (from `@metamask/utils`) does not include `undefined` in its
// `Json` union. This mapped type strips `| undefined` while preserving
// optionality, keeping the type derived from the struct (single source of truth).
type InitRemoteCommsParams = {
  [K in keyof Infer<typeof initRemoteCommsParamsStruct>]: Exclude<
    Infer<typeof initRemoteCommsParamsStruct>[K],
    undefined
  >;
};

export const initRemoteCommsSpec: MethodSpec<
  'initRemoteComms',
  InitRemoteCommsParams,
  null
> = {
  method: 'initRemoteComms',
  // Safe: the struct validates JSON-RPC params which never contain `undefined`.
  params: initRemoteCommsParamsStruct as Struct<InitRemoteCommsParams>,
  result: literal(null),
};

export type InitRemoteCommsHooks = {
  kernel: Pick<Kernel, 'initRemoteComms'>;
};

export const initRemoteCommsHandler: Handler<
  'initRemoteComms',
  InitRemoteCommsParams,
  Promise<null>,
  InitRemoteCommsHooks
> = {
  ...initRemoteCommsSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }, params): Promise<null> => {
    // Build options from only the defined RPC params. Superstruct has
    // already validated the shape; stripping undefined keeps the bag sparse.
    // Note: sensitive fields like `mnemonic` and internal fields like
    // `directTransports` are intentionally excluded from the RPC struct.
    const options: RemoteCommsOptions = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined),
    );
    await kernel.initRemoteComms(options);
    return null;
  },
};
