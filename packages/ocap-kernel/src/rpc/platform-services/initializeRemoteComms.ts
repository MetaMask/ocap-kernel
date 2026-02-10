import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import {
  array,
  boolean,
  object,
  literal,
  string,
  number,
  optional,
} from '@metamask/superstruct';

import type { RemoteCommsOptions } from '../../remotes/types.ts';

const initializeRemoteCommsParamsStruct = object({
  keySeed: string(),
  relays: optional(array(string())),
  maxRetryAttempts: optional(number()),
  maxQueue: optional(number()),
  incarnationId: optional(string()),
  crossIncarnationWake: optional(boolean()),
});

type InitializeRemoteCommsParams = {
  keySeed: string;
  relays?: string[];
  maxRetryAttempts?: number;
  maxQueue?: number;
  incarnationId?: string;
  crossIncarnationWake?: boolean;
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
  incarnationId?: string,
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
    if (params.crossIncarnationWake !== undefined) {
      options.crossIncarnationWake = params.crossIncarnationWake;
    }
    return await initializeRemoteComms(
      params.keySeed,
      options,
      params.incarnationId,
    );
  },
};
