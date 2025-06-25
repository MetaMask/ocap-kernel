import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import type { Kernel, KRef } from '@metamask/ocap-kernel';
import { string, object, boolean } from '@metamask/superstruct';

/**
 * Check if a kernel object has been revoked.
 */
export const isRevokedSpec: MethodSpec<'isRevoked', { kref: KRef }, boolean> = {
  method: 'isRevoked',
  params: object({ kref: string() }), // KRef
  result: boolean(),
  // Using the boolean struct results in `Struct<true, unknown> | Struct<false, unknown>`,
  // which is not what we want.
} as MethodSpec<'isRevoked', { kref: KRef }, boolean>;

export type IsRevokedHooks = {
  kernel: Pick<Kernel, 'isRevoked'>;
};

export const isRevokedHandler: Handler<
  'isRevoked',
  { kref: KRef },
  boolean,
  IsRevokedHooks
> = {
  ...isRevokedSpec,
  hooks: { kernel: true },
  implementation: ({ kernel }, { kref }): boolean => {
    return kernel.isRevoked(kref);
  },
};
