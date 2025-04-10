import { object, literal } from '@metamask/superstruct';
import type { MethodSpec } from '@ocap/rpc-methods';

import { VatIdStruct } from '../../types.ts';
import type { VatId } from '../../types.ts';

export const terminateSpec: MethodSpec<'terminate', { vatId: VatId }, null> = {
  method: 'terminate',
  params: object({ vatId: VatIdStruct }),
  result: literal(null),
};
