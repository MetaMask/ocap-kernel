import { NodejsPlatformServices } from '@metamask/kernel-node-runtime';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import {
  Logger,
  makeConsoleTransport,
  makeArrayTransport,
} from '@metamask/logger';
import type { LogEntry } from '@metamask/logger';
import { Kernel } from '@metamask/ocap-kernel';
import type { KRef, VatId } from '@metamask/ocap-kernel';
import { getWorkerFile } from '@ocap/nodejs-test-workers';
import { describe, expect, it } from 'vitest';

import { extractTestLogs, getBundleSpec } from './utils.ts';

describe('global endowments', () => {
  const vatId: VatId = 'v1';
  const v1Root: KRef = 'ko4';

  const setup = async ({
    globals,
    allowedGlobalNames,
  }: {
    globals: string[];
    allowedGlobalNames?: string[];
  }) => {
    const entries: LogEntry[] = [];
    const logger = new Logger({
      transports: [makeConsoleTransport(), makeArrayTransport(entries)],
    });
    const database = await makeSQLKernelDatabase({});
    const platformServices = new NodejsPlatformServices({
      logger: logger.subLogger({ tags: ['vat-worker-manager'] }),
      workerFilePath: getWorkerFile('mock-fetch'),
    });
    const kernel = await Kernel.make(platformServices, database, {
      resetStorage: true,
      logger,
      allowedGlobalNames,
    });

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
    const { kernel, entries } = await setup({
      globals: ['TextEncoder', 'TextDecoder'],
    });

    await kernel.queueMessage(v1Root, 'testTextCodec', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('textCodec: hello');
  });

  it('can use URL and URLSearchParams', async () => {
    const { kernel, entries } = await setup({
      globals: ['URL', 'URLSearchParams'],
    });

    await kernel.queueMessage(v1Root, 'testUrl', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('url: /path params: 10');
  });

  it('can use atob and btoa', async () => {
    const { kernel, entries } = await setup({ globals: ['atob', 'btoa'] });

    await kernel.queueMessage(v1Root, 'testBase64', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('base64: hello world');
  });

  it('can use AbortController and AbortSignal', async () => {
    const { kernel, entries } = await setup({
      globals: ['AbortController', 'AbortSignal'],
    });

    await kernel.queueMessage(v1Root, 'testAbort', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('abort: before=false after=true');
  });

  it('can use setTimeout and clearTimeout', async () => {
    const { kernel, entries } = await setup({
      globals: ['setTimeout', 'clearTimeout'],
    });

    await kernel.queueMessage(v1Root, 'testTimers', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('timer: fired');
  });

  it('can use real Date (not tamed)', async () => {
    const { kernel, entries } = await setup({ globals: ['Date'] });

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
      const { kernel, entries } = await setup({ globals: [] });

      await kernel.queueMessage(v1Root, 'checkGlobal', [name]);
      await waitUntilQuiescent();

      const logs = extractTestLogs(entries, vatId);
      expect(logs).toContain(`checkGlobal: ${name}=false`);
    });

    it('throws when calling tamed Date.now without endowing Date', async () => {
      const { kernel } = await setup({ globals: [] });

      await expect(kernel.queueMessage(v1Root, 'testDate', [])).rejects.toThrow(
        'secure mode',
      );
    });
  });

  describe('kernel-level allowedGlobalNames restriction', () => {
    it('blocks a global when the kernel excludes it from allowedGlobalNames', async () => {
      // Kernel only allows TextEncoder/TextDecoder — vat requests URL too
      const { kernel, entries } = await setup({
        globals: ['TextEncoder', 'TextDecoder', 'URL'],
        allowedGlobalNames: ['TextEncoder', 'TextDecoder'],
      });

      // TextEncoder works (allowed by kernel)
      await kernel.queueMessage(v1Root, 'testTextCodec', []);
      await waitUntilQuiescent();

      const logs = extractTestLogs(entries, vatId);
      expect(logs).toContain('textCodec: hello');

      // URL is absent (kernel excluded it even though vat requested it)
      await kernel.queueMessage(v1Root, 'checkGlobal', ['URL']);
      await waitUntilQuiescent();

      const logsAfter = extractTestLogs(entries, vatId);
      expect(logsAfter).toContain('checkGlobal: URL=false');
    });

    it('allows all globals when allowedGlobalNames is omitted', async () => {
      // No kernel restriction — vat gets everything it asks for
      const { kernel, entries } = await setup({
        globals: ['URL', 'TextEncoder'],
      });

      await kernel.queueMessage(v1Root, 'checkGlobal', ['URL']);
      await waitUntilQuiescent();
      await kernel.queueMessage(v1Root, 'checkGlobal', ['TextEncoder']);
      await waitUntilQuiescent();

      const logs = extractTestLogs(entries, vatId);
      expect(logs).toContain('checkGlobal: URL=true');
      expect(logs).toContain('checkGlobal: TextEncoder=true');
    });
  });
});
