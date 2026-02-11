import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { string, literal, object } from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';
import type { KRef } from '../../types.ts';

/**
 * Revoke a kernel object.
 */
export const revokeSpec: MethodSpec<'revoke', { kref: KRef }, null> = {
  method: 'revoke',
  params: object({ kref: string() }), // KRef
  result: literal(null),
};

export type RevokeHooks = {
  kernel: Pick<Kernel, 'revoke'>;
};

export const revokeHandler: Handler<
  'revoke',
  { kref: KRef },
  null,
  RevokeHooks
> = {
  ...revokeSpec,
  hooks: { kernel: true },
  implementation: ({ kernel }, { kref }): null => {
    kernel.revoke(kref);
    return null;
  },
};
