import type { MethodSpec } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';
import { literal } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

export const terminateAllSpec: MethodSpec<'terminateAll', Json[], null> = {
  method: 'terminateAll',
  params: EmptyJsonArray,
  result: literal(null),
};
