import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { consoleTransport } from '@metamask/logger';
import { Kernel } from '@metamask/ocap-kernel';
import { describe, expect, it } from 'vitest';

import {
  getBundleSpec,
  makeKernel,
  makeTestLogger,
  runTestVats,
  extractTestLogs,
} from './utils.ts';

const testSubcluster = {
  bootstrap: 'consumer',
  forceReset: true,
  vats: {
    consumer: {
      bundleSpec: getBundleSpec('asyncerator-vat'),
      parameters: {
        name: 'alice',
      },
    },
    producer: {
      bundleSpec: getBundleSpec('asyncerator-vat'),
      parameters: {
        name: 'bob',
      },
    },
  },
};

describe(
  'Async generator consumption between vats',
  {
    timeout: 2000,
  },
  () => {
    let kernel: Kernel;

    it('alice can consume async generator from Bob using for await', async () => {
      const kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      const { logger, entries } = makeTestLogger();
      kernel = await makeKernel(
        kernelDatabase,
        true,
        logger.subLogger({ transports: [consoleTransport] }),
      );

      await runTestVats(kernel, testSubcluster);
      await waitUntilQuiescent(100);

      const aliceLogs = extractTestLogs(entries, 'alice');
      const bobLogs = extractTestLogs(entries, 'bob');
      expect(aliceLogs).toStrictEqual([
        'alice buildRootObject',
        'alice is bootstrap',
        'alice iterating 0',
        'alice iterating 1',
        'alice iterating 2',
        'alice iterating 3',
        'alice iterating 4',
      ]);

      expect(bobLogs).toStrictEqual([
        'bob buildRootObject',
        'bob generating 0',
        'bob generating 1',
        'bob generating 2',
        'bob generating 3',
        'bob generating 4',
      ]);
    });
  },
);
