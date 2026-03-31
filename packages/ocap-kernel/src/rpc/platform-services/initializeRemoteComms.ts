import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import {
  array,
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
  allowedWsHosts: optional(array(string())),
  reconnectionBaseDelayMs: optional(number()),
  reconnectionMaxDelayMs: optional(number()),
  handshakeTimeoutMs: optional(number()),
  writeTimeoutMs: optional(number()),
  ackTimeoutMs: optional(number()),
  incarnationId: optional(string()),
});

type InitializeRemoteCommsParams = {
  keySeed: string;
  relays?: string[];
  maxRetryAttempts?: number;
  maxQueue?: number;
  allowedWsHosts?: string[];
  reconnectionBaseDelayMs?: number;
  reconnectionMaxDelayMs?: number;
  handshakeTimeoutMs?: number;
  writeTimeoutMs?: number;
  ackTimeoutMs?: number;
  incarnationId?: string;
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
    if (params.allowedWsHosts !== undefined) {
      options.allowedWsHosts = params.allowedWsHosts;
    }
    if (params.reconnectionBaseDelayMs !== undefined) {
      options.reconnectionBaseDelayMs = params.reconnectionBaseDelayMs;
    }
    if (params.reconnectionMaxDelayMs !== undefined) {
      options.reconnectionMaxDelayMs = params.reconnectionMaxDelayMs;
    }
    if (params.handshakeTimeoutMs !== undefined) {
      options.handshakeTimeoutMs = params.handshakeTimeoutMs;
    }
    if (params.writeTimeoutMs !== undefined) {
      options.writeTimeoutMs = params.writeTimeoutMs;
    }
    if (params.ackTimeoutMs !== undefined) {
      options.ackTimeoutMs = params.ackTimeoutMs;
    }
    return await initializeRemoteComms(
      params.keySeed,
      options,
      params.incarnationId,
    );
  },
};
