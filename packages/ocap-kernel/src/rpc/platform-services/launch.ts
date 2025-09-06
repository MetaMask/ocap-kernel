import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { literal, object } from '@metamask/superstruct';

import { VatIdStruct, VatConfigStruct } from '../../types.ts';
import type { VatId, VatConfig } from '../../types.ts';

type LaunchParams = {
  vatId: VatId;
  vatConfig: VatConfig;
};

export type LaunchSpec = MethodSpec<'launch', LaunchParams, null>;

export const launchSpec: MethodSpec<'launch', LaunchParams, null> = {
  method: 'launch',
  params: object({ vatId: VatIdStruct, vatConfig: VatConfigStruct }),
  result: literal(null),
};

export type HandleLaunch = (
  vatId: VatId,
  vatConfig: VatConfig,
) => Promise<null>;

type LaunchHooks = {
  launch: HandleLaunch;
};

export type LaunchHandler = Handler<
  'launch',
  LaunchParams,
  Promise<null>,
  LaunchHooks
>;

export const launchHandler: LaunchHandler = {
  ...launchSpec,
  hooks: { launch: true },
  implementation: async ({ launch }, params) => {
    return await launch(params.vatId, params.vatConfig);
  },
};
