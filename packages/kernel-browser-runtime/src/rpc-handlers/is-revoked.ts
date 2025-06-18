import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import type { Kernel, KRef } from '@metamask/ocap-kernel';
import { string, object, boolean, tuple } from '@metamask/superstruct';

/**
 * Check if a kernel object has been revoked.
 */
export const isRevokedSpec: MethodSpec<'isRevoked', { kref: KRef }, [boolean]> =
  {
    method: 'isRevoked',
    params: object({ kref: string() }), // KRef
    result: tuple([boolean()]),
  };

export type IsRevokedHooks = {
  kernel: Pick<Kernel, 'isRevoked'>;
};

export const isRevokedHandler: Handler<
  'isRevoked',
  { kref: KRef },
  [boolean],
  IsRevokedHooks
> = {
  ...isRevokedSpec,
  hooks: { kernel: true },
  implementation: ({ kernel }, { kref }): [boolean] => {
    return [kernel.isRevoked(kref)];
  },
};
