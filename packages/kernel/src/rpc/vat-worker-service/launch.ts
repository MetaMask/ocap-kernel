import { literal, object } from '@metamask/superstruct';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';

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

type LaunchHooks = {
  launch: (vatId: VatId, vatConfig: VatConfig) => Promise<void>;
};

export const launchHandler: Handler<'launch', LaunchParams, null, LaunchHooks> =
  {
    ...launchSpec,
    hooks: { launch: true },
    implementation: async ({ launch }, { vatId, vatConfig }) => {
      await launch(vatId, vatConfig);
      return null;
    },
  };
