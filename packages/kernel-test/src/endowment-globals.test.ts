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
import type { AllowedGlobalName, KRef, VatId } from '@metamask/ocap-kernel';
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
    globals: AllowedGlobalName[];
    allowedGlobalNames?: AllowedGlobalName[];
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

  it('can use setInterval and clearInterval', async () => {
    const { kernel, entries } = await setup({
      globals: ['setInterval', 'clearInterval'],
    });

    await kernel.queueMessage(v1Root, 'testInterval', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('interval: ticks=2');
  });

  it('can use real Date (not tamed)', async () => {
    const { kernel, entries } = await setup({ globals: ['Date'] });

    await kernel.queueMessage(v1Root, 'testDate', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('date: isReal=true');
  });

  it('can use crypto.getRandomValues', async () => {
    const { kernel, entries } = await setup({
      globals: ['crypto', 'SubtleCrypto'],
    });

    await kernel.queueMessage(v1Root, 'testCrypto', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('crypto: hasRandomBytes=true');
  });

  it('can use Math.random sourced from crypto.getRandomValues', async () => {
    const { kernel, entries } = await setup({ globals: ['Math'] });

    await kernel.queueMessage(v1Root, 'testMath', []);
    await waitUntilQuiescent();

    const logs = extractTestLogs(entries, vatId);
    expect(logs).toContain('math: inRange=true');
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
      'setInterval',
      'clearInterval',
      'crypto',
      'SubtleCrypto',
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

    it('throws when calling tamed Math.random without endowing Math', async () => {
      const { kernel } = await setup({ globals: [] });

      await expect(kernel.queueMessage(v1Root, 'testMath', [])).rejects.toThrow(
        'secure mode',
      );
    });
  });

  describe('kernel-level allowedGlobalNames restriction', () => {
    it('throws when a vat requests a global excluded by the kernel', async () => {
      // Kernel only allows TextEncoder/TextDecoder — vat also requests URL
      await expect(
        setup({
          globals: ['TextEncoder', 'TextDecoder', 'URL'],
          allowedGlobalNames: ['TextEncoder', 'TextDecoder'],
        }),
      ).rejects.toThrow('unknown global "URL"');
    });

    it('initializes when all vat globals are within allowedGlobalNames', async () => {
      const { kernel, entries } = await setup({
        globals: ['TextEncoder', 'TextDecoder'],
        allowedGlobalNames: ['TextEncoder', 'TextDecoder'],
      });

      await kernel.queueMessage(v1Root, 'testTextCodec', []);
      await waitUntilQuiescent();

      const logs = extractTestLogs(entries, vatId);
      expect(logs).toContain('textCodec: hello');
    });

    it('allows all globals when allowedGlobalNames is omitted', async () => {
      const { kernel, entries } = await setup({
        globals: ['URL', 'URLSearchParams'],
      });

      await kernel.queueMessage(v1Root, 'testUrl', []);
      await waitUntilQuiescent();

      const logs = extractTestLogs(entries, vatId);
      expect(logs).toContain('url: /path params: 10');
    });

    it('rejects every vat global when allowedGlobalNames is empty', async () => {
      await expect(
        setup({
          globals: ['TextEncoder'],
          allowedGlobalNames: [],
        }),
      ).rejects.toThrow('unknown global "TextEncoder"');
    });

    it('rejects unknown names in allowedGlobalNames at the RPC boundary', async () => {
      // Callers on the typed API get a compile-time error. This test covers
      // the runtime check: the `initVat` RPC struct (`AllowedGlobalNameStruct`)
      // rejects any name outside the literal union, so a caller that bypasses
      // the type system (e.g., JS client, cast) still cannot smuggle bad names
      // through.
      await expect(
        setup({
          globals: ['TextEncoder', 'TextDecoder'],
          allowedGlobalNames: [
            'TextEncoder',
            'TextDecoder',
            'NotARealGlobal' as AllowedGlobalName,
          ],
        }),
      ).rejects.toThrow(/Invalid params/u);
    });
  });
});
