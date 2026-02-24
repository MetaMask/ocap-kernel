import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import {
  object,
  literal,
  optional,
  array,
  string,
  number,
} from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';
import type { RemoteCommsOptions } from '../../remotes/types.ts';

const initRemoteCommsParamsStruct = object({
  relays: optional(array(string())),
  directListenAddresses: optional(array(string())),
  maxRetryAttempts: optional(number()),
  maxQueue: optional(number()),
});

type InitRemoteCommsParams = {
  relays?: string[];
  directListenAddresses?: string[];
  maxRetryAttempts?: number;
  maxQueue?: number;
};

type InitRemoteCommsSpec = MethodSpec<
  'initRemoteComms',
  InitRemoteCommsParams,
  null
>;

export const initRemoteCommsSpec: InitRemoteCommsSpec = {
  method: 'initRemoteComms',
  params: initRemoteCommsParamsStruct,
  result: literal(null),
} as InitRemoteCommsSpec;

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
