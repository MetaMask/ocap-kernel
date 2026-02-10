import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';
import { literal } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

export type ResetAllBackoffsSpec = MethodSpec<'resetAllBackoffs', Json[], null>;

export const resetAllBackoffsSpec: ResetAllBackoffsSpec = {
  method: 'resetAllBackoffs',
  params: EmptyJsonArray,
  result: literal(null),
};

export type ResetAllBackoffsImpl = () => Promise<null>;

type ResetAllBackoffsHooks = {
  resetAllBackoffs: ResetAllBackoffsImpl;
};

export type ResetAllBackoffsHandler = Handler<
  'resetAllBackoffs',
  Json[],
  Promise<null>,
  ResetAllBackoffsHooks
>;

export const resetAllBackoffsHandler: ResetAllBackoffsHandler = {
  ...resetAllBackoffsSpec,
  hooks: { resetAllBackoffs: true },
  implementation: async ({ resetAllBackoffs }, _params) => {
    await resetAllBackoffs();
    return null;
  },
};
