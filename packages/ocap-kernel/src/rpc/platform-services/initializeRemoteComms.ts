import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { array, object, literal, string } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

const initializeRemoteCommsParamsStruct = object({
  keySeed: string(),
  knownRelays: array(string()),
});

type InitializeRemoteCommsParams = Infer<
  typeof initializeRemoteCommsParamsStruct
>;

export type InitializeRemoteCommsSpec = MethodSpec<
  'initializeRemoteComms',
  InitializeRemoteCommsParams,
  null
>;

export const initializeRemoteCommsSpec: InitializeRemoteCommsSpec = {
  method: 'initializeRemoteComms',
  params: initializeRemoteCommsParamsStruct,
  result: literal(null),
};

export type InitializeRemoteComms = (
  keySeed: string,
  knownRelays: string[],
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
    return await initializeRemoteComms(params.keySeed, params.knownRelays);
  },
};
