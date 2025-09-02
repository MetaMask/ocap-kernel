import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { makeKernelStore } from '@metamask/ocap-kernel';
import { describe, expect, it, beforeEach } from 'vitest';

import {
  getBundleSpec,
  makeKernel,
  makeTestLogger,
  runTestVats,
} from './utils.ts';

describe('Vat Lifecycle', { timeout: 30_000 }, () => {
  let logger: ReturnType<typeof makeTestLogger>;

  beforeEach(async () => {
    logger = makeTestLogger();
  });

  it('should clean up manually terminated vats', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const kernel = await makeKernel(
      kernelDatabase,
      true,
      logger.logger.subLogger({ tags: ['test'] }),
    );
    const kernelStore = makeKernelStore(kernelDatabase);

    const subcluster = {
      bootstrap: 'crasher',
      vats: {
        crasher: {
          bundleSpec: getBundleSpec('crash-test-vat'),
          parameters: { name: 'CrashTestVat' },
        },
      },
    };

    await runTestVats(kernel, subcluster);
    await waitUntilQuiescent();

    const initialVats = kernel.getVats();
    const crasherVat = initialVats.find(
      ({ config }) => config.parameters?.name === 'CrashTestVat',
    );
    const crasherVatId = crasherVat?.id as string;

    // Manually terminate the vat (simulating actual crash recovery)
    await kernel.terminateVat(crasherVatId);
    await waitUntilQuiescent();

    // Verify vat is cleaned up
    const finalVats = kernel.getVats();
    const activeCrasherVat = finalVats.find(({ id }) => id === crasherVatId);
    expect(activeCrasherVat).toBeUndefined();

    // Trigger garbage collection to clean up terminated vat objects
    kernel.collectGarbage();
    await waitUntilQuiescent();

    // Verify kernel store cleanup - root object should be cleaned up after GC
    const rootObject = kernelStore.getRootObject(crasherVatId);
    expect(rootObject).toBeUndefined();
  });
});
