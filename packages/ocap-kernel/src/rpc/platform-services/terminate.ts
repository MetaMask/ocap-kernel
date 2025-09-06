import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, literal } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import { VatIdStruct } from '../../types.ts';
import type { VatId } from '../../types.ts';

const terminateParamsStruct = object({ vatId: VatIdStruct });

type TerminateParams = Infer<typeof terminateParamsStruct>;

export type TerminateSpec = MethodSpec<'terminate', TerminateParams, null>;

export const terminateSpec: TerminateSpec = {
  method: 'terminate',
  params: terminateParamsStruct,
  result: literal(null),
};

export type Terminate = (vatId: VatId) => Promise<null>;

type TerminateHooks = {
  terminate: Terminate;
};

export type TerminateHandler = Handler<
  'terminate',
  TerminateParams,
  Promise<null>,
  TerminateHooks
>;

export const terminateHandler: TerminateHandler = {
  ...terminateSpec,
  hooks: { terminate: true },
  implementation: async ({ terminate }, params) => {
    return await terminate(params.vatId);
  },
};
