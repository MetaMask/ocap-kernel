import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { describe, expect, it } from 'vitest';

import {
  extractTestLogs,
  getBundleSpec,
  makeKernel,
  makeTestLogger,
  runTestVats,
} from './utils.ts';

const testSubcluster = {
  bootstrap: 'main',
  forceReset: true,
  vats: {
    main: {
      bundleSpec: getBundleSpec('lms-user-vat'),
      parameters: {
        name: 'Alice',
      },
    },
    languageModelService: {
      bundleSpec: getBundleSpec('lms-queue-vat'),
    },
  },
};

describe('lms-user vat', () => {
  it('logs response from language model', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const { logger, entries } = makeTestLogger();
    const kernel = await makeKernel(kernelDatabase, true, logger);

    await runTestVats(kernel, testSubcluster);
    await waitUntilQuiescent(100);

    const testLogs = extractTestLogs(entries);
    expect(testLogs).toContain('response: My name is Alice.');
  });
});
