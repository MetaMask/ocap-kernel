import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { string, object } from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';

/**
 * Redeem an OCAP URL to get its kernel reference.
 */
export const redeemOcapURLSpec: MethodSpec<
  'redeemOcapURL',
  { url: string },
  string
> = {
  method: 'redeemOcapURL',
  params: object({ url: string() }),
  result: string(),
};

export type RedeemOcapURLHooks = {
  kernel: Pick<Kernel, 'redeemOcapURL'>;
};

export const redeemOcapURLHandler: Handler<
  'redeemOcapURL',
  { url: string },
  Promise<string>,
  RedeemOcapURLHooks
> = {
  ...redeemOcapURLSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }, { url }): Promise<string> => {
    return kernel.redeemOcapURL(url);
  },
};
