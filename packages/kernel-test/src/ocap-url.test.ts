import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { describe, expect, it } from 'vitest';

import {
  extractTestLogs,
  getBundleSpec,
  makeKernel,
  makeTestLogger,
} from './utils.ts';

describe('ocap-url', () => {
  it('user-code can make an ocap url', async () => {
    const { logger, entries } = makeTestLogger();
    const database = await makeSQLKernelDatabase({});
    const kernel = await makeKernel(database, true, logger);
    const vatIds = ['v1'];
    const vat = await kernel.launchSubcluster({
      bootstrap: 'alice',
      vats: {
        alice: {
          bundleSpec: getBundleSpec('ocap-url'),
          parameters: {},
        },
      },
    });
    expect(vat).toBeDefined();
    const vats = kernel.getVatIds();
    expect(vats).toStrictEqual(vatIds);

    await waitUntilQuiescent();
    const vatLogs = vatIds.map((vatId) => extractTestLogs(entries, vatId));
    expect(vatLogs).toStrictEqual([
      // This is a placeholder for the actual ocap url.
      [expect.stringContaining(`Alice's ocap url: ocap://o+`)],
    ]);
  });
});
