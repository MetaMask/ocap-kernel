import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import type { KRef, VatId } from '@metamask/ocap-kernel';
import { getWorkerFile } from '@ocap/nodejs-test-workers';
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
    const v1Root: KRef = 'ko4';
    const { logger, entries } = makeTestLogger();
    const database = await makeSQLKernelDatabase({});
    const kernel = await makeKernel(
      database,
      true,
      logger,
      getWorkerFile('mock-fetch'),
    );
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
    await kernel.queueMessage(v1Root, 'hello', [`https://${goodHost}`]);

    await waitUntilQuiescent();

    await kernel.queueMessage(v1Root, 'hello', [`https://${badHost}`]);

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
