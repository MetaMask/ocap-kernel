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

describe('global endowments', () => {
  const vatId: VatId = 'v1';
  const v1Root: KRef = 'ko4';

  const setup = async (globals: string[]) => {
    const { logger, entries } = makeTestLogger();
    const database = await makeSQLKernelDatabase({});
    const kernel = await makeKernel(
      database,
      true,
      logger,
      getWorkerFile('mock-fetch'),
    );

    await kernel.launchSubcluster({
      bootstrap: 'main',
      vats: {
        main: {
          bundleSpec: getBundleSpec('endowment-globals'),
          parameters: {},
          globals,
        },
      },
    });
    await waitUntilQuiescent();

    return { kernel, entries };
  };

  it('can use TextEncoder and TextDecoder', async () => {
    const { kernel, entries } = await setup(['TextEncoder', 'TextDecoder']);

    await kernel.queueMessage(v1Root, 'testTextCodec', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('textCodec: hello');
  });

  it('can use URL and URLSearchParams', async () => {
    const { kernel, entries } = await setup(['URL', 'URLSearchParams']);

    await kernel.queueMessage(v1Root, 'testUrl', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('url: /path params: 10');
  });

  it('can use atob and btoa', async () => {
    const { kernel, entries } = await setup(['atob', 'btoa']);

    await kernel.queueMessage(v1Root, 'testBase64', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('base64: hello world');
  });

  it('can use AbortController and AbortSignal', async () => {
    const { kernel, entries } = await setup(['AbortController', 'AbortSignal']);

    await kernel.queueMessage(v1Root, 'testAbort', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('abort: before=false after=true');
  });

  it('can use setTimeout and clearTimeout', async () => {
    const { kernel, entries } = await setup(['setTimeout', 'clearTimeout']);

    await kernel.queueMessage(v1Root, 'testTimers', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('timer: fired');
  });

  it('can use real Date (not tamed)', async () => {
    const { kernel, entries } = await setup(['Date']);

    await kernel.queueMessage(v1Root, 'testDate', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('date: isReal=true');
  });

  describe('host APIs are absent when not endowed', () => {
    // These are Web/host APIs that are NOT JS intrinsics — they should
    // be genuinely absent from a SES compartment unless explicitly endowed.
    it.each([
      'TextEncoder',
      'TextDecoder',
      'URL',
      'URLSearchParams',
      'atob',
      'btoa',
      'AbortController',
      'AbortSignal',
      'setTimeout',
      'clearTimeout',
    ])('does not have %s without endowing it', async (name) => {
      // Launch with no globals at all
      const { kernel, entries } = await setup([]);

      await kernel.queueMessage(v1Root, 'checkGlobal', [name]);
      await waitUntilQuiescent();

      const logs = extractTestLogs(entries, vatId);
      expect(logs).toContain(`checkGlobal: ${name}=false`);
    });

    it('throws when calling tamed Date.now without endowing Date', async () => {
      const { kernel } = await setup([]);

      await expect(kernel.queueMessage(v1Root, 'testDate', [])).rejects.toThrow(
        'secure mode',
      );
    });
  });
});
