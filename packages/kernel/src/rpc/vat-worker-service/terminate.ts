import { object, literal } from '@metamask/superstruct';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';

import { VatIdStruct } from '../../types.ts';
import type { VatId } from '../../types.ts';

export const terminateSpec: MethodSpec<'terminate', { vatId: VatId }, null> = {
  method: 'terminate',
  params: object({ vatId: VatIdStruct }),
  result: literal(null),
};

type TerminateHooks = {
  terminate: (vatId: VatId) => Promise<void>;
};

export const terminateHandler: Handler<
  'terminate',
  { vatId: VatId },
  null,
  TerminateHooks
> = {
  ...terminateSpec,
  hooks: { terminate: true },
  implementation: async ({ terminate }, { vatId }) => {
    await terminate(vatId);
    return null;
  },
};
