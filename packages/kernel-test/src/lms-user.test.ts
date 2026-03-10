import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { LANGUAGE_MODEL_SERVICE_NAME } from '@ocap/kernel-language-model-service';
import { describe, expect, it } from 'vitest';

import {
  extractTestLogs,
  getBundleSpec,
  makeKernel,
  makeTestLogger,
  runTestVats,
} from './utils.ts';

describe('lms-user vat', () => {
  it('logs response from language model', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const { logger, entries } = makeTestLogger();
    const kernel = await makeKernel(
      kernelDatabase,
      true,
      logger,
      undefined,
      undefined,
      undefined,
      [
        {
          name: 'languageModelService',
          config: {
            bootstrap: 'lms',
            vats: { lms: { bundleSpec: getBundleSpec('lms-queue-vat') } },
          },
          registersAsService: LANGUAGE_MODEL_SERVICE_NAME,
        },
      ],
    );

    const testSubcluster = {
      bootstrap: 'main',
      services: [LANGUAGE_MODEL_SERVICE_NAME],
      vats: {
        main: {
          bundleSpec: getBundleSpec('lms-user-vat'),
          parameters: { name: 'Alice' },
        },
      },
    };

    await runTestVats(kernel, testSubcluster);
    await waitUntilQuiescent(100);

    const testLogs = extractTestLogs(entries);
    expect(testLogs).toContain('response: My name is Alice.');
  });
});
