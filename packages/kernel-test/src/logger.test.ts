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

describe('logger', () => {
  it('captures logs from vat', async () => {
    const vatId: VatId = 'v1';
    const name = 'Alice';
    const { logger, entries } = makeTestLogger();
    const database = await makeSQLKernelDatabase({});
    const kernel = await makeKernel(database, true, logger);
    const vat = await kernel.launchVat({
      bundleSpec: getBundleSpec('logger-vat'),
      parameters: { name },
    });
    const vats = kernel.getVatIds();
    expect(vats).toStrictEqual([vatId]);

    await waitUntilQuiescent();
    await kernel.queueMessage(vat, 'foo', []);

    await waitUntilQuiescent();
    const vatLogs = extractTestLogs(entries, vatId);
    expect(vatLogs).toStrictEqual([`foo: ${name}`]);
  });
});
