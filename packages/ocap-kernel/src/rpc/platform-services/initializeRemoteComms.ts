import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import {
  array,
  object,
  literal,
  string,
  number,
  optional,
} from '@metamask/superstruct';

import type { RemoteCommsOptions } from 'src/remotes/types';

const initializeRemoteCommsParamsStruct = object({
  keySeed: string(),
  relays: optional(array(string())),
  maxRetryAttempts: optional(number()),
  maxQueue: optional(number()),
});

type InitializeRemoteCommsParams = {
  keySeed: string;
  relays?: string[];
  maxRetryAttempts?: number;
  maxQueue?: number;
};

export type InitializeRemoteCommsSpec = MethodSpec<
  'initializeRemoteComms',
  InitializeRemoteCommsParams,
  null
>;

export const initializeRemoteCommsSpec: InitializeRemoteCommsSpec = {
  method: 'initializeRemoteComms',
  params: initializeRemoteCommsParamsStruct,
  result: literal(null),
} as InitializeRemoteCommsSpec;

export type InitializeRemoteComms = (
  keySeed: string,
  options: RemoteCommsOptions,
) => Promise<null>;

type InitializeRemoteCommsHooks = {
  initializeRemoteComms: InitializeRemoteComms;
};

export type InitializeRemoteCommsHandler = Handler<
  'initializeRemoteComms',
  InitializeRemoteCommsParams,
  Promise<null>,
  InitializeRemoteCommsHooks
>;

export const initializeRemoteCommsHandler: InitializeRemoteCommsHandler = {
  ...initializeRemoteCommsSpec,
  hooks: { initializeRemoteComms: true },
  implementation: async ({ initializeRemoteComms }, params) => {
    const options: RemoteCommsOptions = {};
    if (params.relays !== undefined) {
      options.relays = params.relays;
    }
    if (params.maxRetryAttempts !== undefined) {
      options.maxRetryAttempts = params.maxRetryAttempts;
    }
    if (params.maxQueue !== undefined) {
      options.maxQueue = params.maxQueue;
    }
    return await initializeRemoteComms(params.keySeed, options);
  },
};
