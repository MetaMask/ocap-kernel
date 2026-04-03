import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { string, object } from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';
import type { KRef } from '../../types.ts';
import { KRefStruct } from '../../types.ts';

/**
 * Issue an OCAP URL for a kernel object.
 */
export const issueOcapURLSpec: MethodSpec<
  'issueOcapURL',
  { kref: KRef },
  string
> = {
  method: 'issueOcapURL',
  params: object({ kref: KRefStruct }),
  result: string(),
};

export type IssueOcapURLHooks = {
  kernel: Pick<Kernel, 'issueOcapURL'>;
};

export const issueOcapURLHandler: Handler<
  'issueOcapURL',
  { kref: KRef },
  Promise<string>,
  IssueOcapURLHooks
> = {
  ...issueOcapURLSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }, { kref }): Promise<string> => {
    return kernel.issueOcapURL(kref);
  },
};
