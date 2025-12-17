import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, array, literal, string } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

const registerLocationHintsParamsStruct = object({
  peerId: string(),
  hints: array(string()),
});

type RegisterLocationHintsParams = Infer<
  typeof registerLocationHintsParamsStruct
>;

export type RegisterLocationHintsSpec = MethodSpec<
  'registerLocationHints',
  RegisterLocationHintsParams,
  null
>;

export const registerLocationHintsSpec: RegisterLocationHintsSpec = {
  method: 'registerLocationHints',
  params: registerLocationHintsParamsStruct,
  result: literal(null),
};

export type RegisterLocationHints = (
  peerId: string,
  hints: string[],
) => Promise<null>;

type RegisterLocationHintsHooks = {
  registerLocationHints: RegisterLocationHints;
};

export type RegisterLocationHintsHandler = Handler<
  'registerLocationHints',
  RegisterLocationHintsParams,
  Promise<null>,
  RegisterLocationHintsHooks
>;

export const registerLocationHintsHandler: RegisterLocationHintsHandler = {
  ...registerLocationHintsSpec,
  hooks: { registerLocationHints: true },
  implementation: async ({ registerLocationHints }, params) => {
    return await registerLocationHints(params.peerId, params.hints);
  },
};
