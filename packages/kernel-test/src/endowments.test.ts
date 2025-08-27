import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import type { VatId } from '@metamask/ocap-kernel';
import { describe, expect, it } from 'vitest';

import {
  extractTestLogs,
  getBundleSpec,
  makeKernel,
  makeTestLogger,
} from './utils.ts';

describe('endowments', () => {
  it('can use endowments', async () => {
    const expectedResponse = 'Hello, world!';
    const vatId: VatId = 'v1';
    const { logger, entries } = makeTestLogger();
    const database = await makeSQLKernelDatabase({});
    const kernel = await makeKernel(database, true, logger);
    const goodHost = 'good-url.test';
    const badHost = 'bad-url.test';
    const vat = await kernel.launchSubcluster({
      bootstrap: 'main',
      vats: {
        main: {
          bundleSpec: getBundleSpec('endowment-fetch'),
          parameters: {},
          platformConfig: {
            fetch: {
              allowedHosts: [goodHost],
            },
          },
        },
      },
    });
    expect(vat).toBeDefined();
    const vats = kernel.getVatIds();
    expect(vats).toStrictEqual([vatId]);

    await waitUntilQuiescent();
    await kernel.queueMessage('ko1', 'hello', [`https://${goodHost}`]);

    await waitUntilQuiescent();

    await kernel.queueMessage('ko1', 'hello', [`https://${badHost}`]);

    await waitUntilQuiescent();

    const vatLogs = extractTestLogs(entries, vatId);
    expect(vatLogs).toStrictEqual([
      'buildRootObject',
      'bootstrap',
      `response: ${expectedResponse}`,
      `error: Error: Invalid host: ${badHost}`,
    ]);
  });
});
