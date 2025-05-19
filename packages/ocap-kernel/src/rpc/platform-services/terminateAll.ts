import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';
import { literal } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

const terminateAllParamsStruct = EmptyJsonArray;

type TerminateAllParams = Json[];

export type TerminateAllSpec = MethodSpec<
  'terminateAll',
  TerminateAllParams,
  null
>;

export const terminateAllSpec: TerminateAllSpec = {
  method: 'terminateAll',
  params: terminateAllParamsStruct,
  result: literal(null),
};

export type TerminateAll = () => Promise<null>;

type TerminateAllHooks = {
  terminateAll: TerminateAll;
};

export type TerminateAllHandler = Handler<
  'terminateAll',
  TerminateAllParams,
  Promise<null>,
  TerminateAllHooks
>;

export const terminateAllHandler: TerminateAllHandler = {
  ...terminateAllSpec,
  hooks: { terminateAll: true },
  implementation: async ({ terminateAll }, _params) => {
    return await terminateAll();
  },
};
