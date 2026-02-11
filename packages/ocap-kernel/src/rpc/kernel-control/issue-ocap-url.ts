import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { string, object } from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';

/**
 * Issue an OCAP URL for a kernel object.
 */
export const issueOcapURLSpec: MethodSpec<
  'issueOcapURL',
  { kref: string },
  string
> = {
  method: 'issueOcapURL',
  params: object({ kref: string() }),
  result: string(),
};

export type IssueOcapURLHooks = {
  kernel: Pick<Kernel, 'issueOcapURL'>;
};

export const issueOcapURLHandler: Handler<
  'issueOcapURL',
  { kref: string },
  Promise<string>,
  IssueOcapURLHooks
> = {
  ...issueOcapURLSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }, { kref }): Promise<string> => {
    return kernel.issueOcapURL(kref);
  },
};
