import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, array, literal, string } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';

const registerLocationHintsParamsStruct = object({
  peerId: string(),
  hints: array(string()),
});

type RegisterLocationHintsParams = Infer<
  typeof registerLocationHintsParamsStruct
>;

export const registerLocationHintsSpec: MethodSpec<
  'registerLocationHints',
  RegisterLocationHintsParams,
  null
> = {
  method: 'registerLocationHints',
  params: registerLocationHintsParamsStruct,
  result: literal(null),
};

export type RegisterLocationHintsHooks = {
  kernel: Pick<Kernel, 'registerLocationHints'>;
};

export const registerLocationHintsHandler: Handler<
  'registerLocationHints',
  RegisterLocationHintsParams,
  Promise<null>,
  RegisterLocationHintsHooks
> = {
  ...registerLocationHintsSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }, params): Promise<null> => {
    await kernel.registerLocationHints(params.peerId, params.hints);
    return null;
  },
};
