import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import {
  object,
  literal,
  optional,
  array,
  string,
  number,
} from '@metamask/superstruct';
import type { Struct } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';
import type { RemoteCommsOptions } from '../../remotes/types.ts';

const initRemoteCommsParamsStruct = object({
  relays: optional(array(string())),
  directListenAddresses: optional(array(string())),
  maxRetryAttempts: optional(number()),
  maxQueue: optional(number()),
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
    const options: RemoteCommsOptions = {};
    if (params.relays !== undefined) {
      options.relays = params.relays;
    }
    if (params.directListenAddresses !== undefined) {
      options.directListenAddresses = params.directListenAddresses;
    }
    if (params.maxRetryAttempts !== undefined) {
      options.maxRetryAttempts = params.maxRetryAttempts;
    }
    if (params.maxQueue !== undefined) {
      options.maxQueue = params.maxQueue;
    }
    await kernel.initRemoteComms(options);
    return null;
  },
};
