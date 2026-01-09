import '../env/endoify.ts';

import { Kernel } from '@metamask/ocap-kernel';
import { describe, expect, it, vi } from 'vitest';

import { makeKernel } from './make-kernel.ts';

vi.mock('@metamask/kernel-store/sqlite/nodejs', async () => {
  const { makeMapKernelDatabase } = await import(
    '../../../ocap-kernel/test/storage.ts'
  );
  return {
    makeSQLKernelDatabase: makeMapKernelDatabase,
  };
});

describe('makeKernel', () => {
  it('should return a Kernel', async () => {
    const kernel = await makeKernel({});

    expect(kernel).toBeInstanceOf(Kernel);
  });
});
