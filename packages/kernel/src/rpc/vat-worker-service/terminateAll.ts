import { literal } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { MethodSpec } from '@ocap/rpc-methods';
import { EmptyJsonArray } from '@ocap/utils';

export const terminateAllSpec: MethodSpec<'terminateAll', Json[], null> = {
  method: 'terminateAll',
  params: EmptyJsonArray,
  result: literal(null),
};
