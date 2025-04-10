import { literal, object } from '@metamask/superstruct';
import type { MethodSpec } from '@ocap/rpc-methods';

import { VatIdStruct, VatConfigStruct } from '../../types.ts';
import type { VatId, VatConfig } from '../../types.ts';

type LaunchParams = {
  vatId: VatId;
  vatConfig: VatConfig;
};

export const launchSpec: MethodSpec<'launch', LaunchParams, null> = {
  method: 'launch',
  params: object({ vatId: VatIdStruct, vatConfig: VatConfigStruct }),
  result: literal(null),
};
