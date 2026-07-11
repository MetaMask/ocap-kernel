import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, literal, string, optional } from '@metamask/superstruct';
import { JsonStruct } from '@metamask/utils';
import type { Json } from '@metamask/utils';

const initializeRemoteCommsParamsStruct = object({
  keySeed: string(),
  specifier: object({ netlayer: string(), config: JsonStruct }),
  incarnationId: optional(string()),
});

type InitializeRemoteCommsParams = {
  keySeed: string;
  specifier: { netlayer: string; config: Json };
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

// Hooks (functions) never cross this RPC boundary; only `keySeed`, the `Json`
// `specifier`, and `incarnationId` are transmitted. `PlatformServicesServer`
// reconstructs the netlayer hooks locally.
export type InitializeRemoteComms = (
  keySeed: string,
  specifier: { netlayer: string; config: Json },
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
  implementation: async ({ initializeRemoteComms }, params) =>
    initializeRemoteComms(
      params.keySeed,
      params.specifier,
      params.incarnationId,
    ),
};
