import { EmptyJsonArray } from '@metamask/kernel-utils';
import { literal } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { MethodSpec } from '@ocap/rpc-methods';

export const terminateAllSpec: MethodSpec<'terminateAll', Json[], null> = {
  method: 'terminateAll',
  params: EmptyJsonArray,
  result: literal(null),
};
