import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { describe, expect, it } from 'vitest';

import {
  extractTestLogs,
  getBundleSpec,
  makeKernel,
  makeTestLogger,
} from './utils.ts';

describe('revocation', () => {
  it('user-code revoker can call kernel syscall', async () => {
    const { logger, entries } = makeTestLogger();
    const database = await makeSQLKernelDatabase({});
    const kernel = await makeKernel(database, true, logger);
    const vatIds = ['v1', 'v2'];
    const vat = await kernel.launchSubcluster({
      bootstrap: 'main',
      vats: {
        main: {
          bundleSpec: getBundleSpec('revocation-bootstrap'),
          parameters: {},
        },
        provider: {
          bundleSpec: getBundleSpec('revocation-provider'),
          parameters: {},
        },
      },
    });
    expect(vat).toBeDefined();
    const vats = kernel.getVatIds();
    expect(vats).toStrictEqual(vatIds);

    await waitUntilQuiescent();
    expect(kernel.isRevoked('ko1')).toBe(false);
    expect(kernel.isRevoked('ko2')).toBe(false);
    expect(kernel.isRevoked('ko3')).toBe(true);
    const vatLogs = vatIds.map((vatId) => extractTestLogs(entries, vatId));
    expect(vatLogs).toStrictEqual([
      ['foo', 'bar', 'revoked object', 'done'],
      ['slam:0'],
    ]);
  });
});
