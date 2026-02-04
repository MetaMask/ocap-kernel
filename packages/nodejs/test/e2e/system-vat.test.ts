import type { KernelDatabase } from '@metamask/kernel-store';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import type { SystemVatConfig, ClusterConfig } from '@metamask/ocap-kernel';
import { describe, it, expect, afterEach } from 'vitest';

import { makeTestKernel } from '../helpers/kernel.ts';

const SYSTEM_VAT_BUNDLE_URL = 'http://localhost:3000/system-vat.bundle';
const SAMPLE_VAT_BUNDLE_URL = 'http://localhost:3000/sample-vat.bundle';

describe('System Vat', { timeout: 30_000 }, () => {
  let kernel: Kernel | undefined;
  let kernelDatabase: KernelDatabase | undefined;

  const makeSystemVatConfig = (
    name: string,
    services: string[] = ['kernelFacet'],
  ): SystemVatConfig => ({
    name,
    bundleSpec: SYSTEM_VAT_BUNDLE_URL,
    parameters: { name },
    services,
  });

  afterEach(async () => {
    if (kernel) {
      const stopResult = kernel.stop();
      kernel = undefined;
      await stopResult;
    }
    if (kernelDatabase) {
      kernelDatabase.close();
      kernelDatabase = undefined;
    }
  });

  describe('initialization', () => {
    it('launches system vat at kernel initialization', async () => {
      kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      kernel = await makeTestKernel(kernelDatabase, true, {
        systemVats: [makeSystemVatConfig('test-system')],
      });

      // System vat should be running (has a vat ID)
      expect(kernel.getVatIds().length).toBeGreaterThan(0);
    });

    it('provides system vat root via getSystemVatRoot', async () => {
      kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      kernel = await makeTestKernel(kernelDatabase, true, {
        systemVats: [makeSystemVatConfig('test-system')],
      });

      const root = kernel.getSystemVatRoot('test-system');
      expect(root).toBeDefined();
      expect(typeof root).toBe('string');
      expect(root).toMatch(/^ko\d+$/u);
    });

    it('returns undefined for unknown system vat name', async () => {
      kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      kernel = await makeTestKernel(kernelDatabase, true, {
        systemVats: [makeSystemVatConfig('test-system')],
      });

      const root = kernel.getSystemVatRoot('unknown-vat');
      expect(root).toBeUndefined();
    });
  });

  describe('kernel services', () => {
    it('receives kernelFacet service in bootstrap', async () => {
      kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      kernel = await makeTestKernel(kernelDatabase, true, {
        systemVats: [makeSystemVatConfig('test-system')],
      });

      const root = kernel.getSystemVatRoot('test-system');
      expect(root).toBeDefined();

      const result = await kernel.queueMessage(root!, 'hasKernelFacet', []);
      await waitUntilQuiescent();

      expect(kunser(result)).toBe(true);
    });

    it('queries kernel status via kernelFacet', async () => {
      kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      kernel = await makeTestKernel(kernelDatabase, true, {
        systemVats: [makeSystemVatConfig('test-system')],
      });

      const root = kernel.getSystemVatRoot('test-system');
      expect(root).toBeDefined();

      const result = await kernel.queueMessage(root!, 'getKernelStatus', []);
      await waitUntilQuiescent();

      const status = kunser(result) as {
        vats: unknown[];
        subclusters: unknown[];
      };
      expect(status).toBeDefined();
      expect(Array.isArray(status.vats)).toBe(true);
      expect(status.vats).toHaveLength(1);
      expect(Array.isArray(status.subclusters)).toBe(true);
      expect(status.subclusters).toHaveLength(1);
    });

    it('retrieves subclusters via kernelFacet', async () => {
      kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      kernel = await makeTestKernel(kernelDatabase, true, {
        systemVats: [makeSystemVatConfig('test-system')],
      });

      const root = kernel.getSystemVatRoot('test-system');
      expect(root).toBeDefined();

      const result = await kernel.queueMessage(root!, 'getSubclusters', []);
      await waitUntilQuiescent();

      const subclusters = kunser(result) as unknown[];
      expect(Array.isArray(subclusters)).toBe(true);
      // At least the system vat's subcluster should exist
      expect(subclusters).toHaveLength(1);
    });
  });

  describe('subcluster management', () => {
    it('launches subcluster via kernelFacet', async () => {
      kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      kernel = await makeTestKernel(kernelDatabase, true, {
        systemVats: [makeSystemVatConfig('test-system')],
      });

      const root = kernel.getSystemVatRoot('test-system');
      expect(root).toBeDefined();

      // Get initial subcluster count
      const initialResult = await kernel.queueMessage(
        root!,
        'getSubclusters',
        [],
      );
      await waitUntilQuiescent();
      const initialSubclusters = kunser(initialResult) as unknown[];
      expect(initialSubclusters).toHaveLength(1);

      // Launch a new subcluster via the system vat
      const config: ClusterConfig = {
        bootstrap: 'child',
        vats: {
          child: {
            bundleSpec: SAMPLE_VAT_BUNDLE_URL,
            parameters: { name: 'child-vat' },
          },
        },
      };

      await kernel.queueMessage(root!, 'launchSubcluster', [config]);
      await waitUntilQuiescent();

      // Verify subcluster was created
      const afterResult = await kernel.queueMessage(
        root!,
        'getSubclusters',
        [],
      );
      await waitUntilQuiescent();
      const afterSubclusters = kunser(afterResult) as unknown[];

      expect(afterSubclusters).toHaveLength(2);
    });

    it('terminates subcluster via kernelFacet', async () => {
      kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      kernel = await makeTestKernel(kernelDatabase, true, {
        systemVats: [makeSystemVatConfig('test-system')],
      });

      const root = kernel.getSystemVatRoot('test-system');
      expect(root).toBeDefined();

      // Launch a subcluster to terminate
      const config: ClusterConfig = {
        bootstrap: 'child',
        vats: {
          child: {
            bundleSpec: SAMPLE_VAT_BUNDLE_URL,
            parameters: { name: 'child-vat' },
          },
        },
      };

      const launchResult = await kernel.queueMessage(
        root!,
        'launchSubcluster',
        [config],
      );
      await waitUntilQuiescent();
      const launchData = kunser(launchResult) as { subclusterId: string };
      const { subclusterId } = launchData;

      // Get count before termination
      const beforeResult = await kernel.queueMessage(
        root!,
        'getSubclusters',
        [],
      );
      await waitUntilQuiescent();
      const beforeSubclusters = kunser(beforeResult) as unknown[];
      expect(beforeSubclusters).toHaveLength(2);

      // Terminate the subcluster
      await kernel.queueMessage(root!, 'terminateSubcluster', [subclusterId]);
      await waitUntilQuiescent();

      // Verify subcluster was terminated
      const afterResult = await kernel.queueMessage(
        root!,
        'getSubclusters',
        [],
      );
      await waitUntilQuiescent();
      const afterSubclusters = kunser(afterResult) as unknown[];

      expect(afterSubclusters).toHaveLength(1);
    });
  });

  describe('system vat relaunch', () => {
    it('terminates and relaunches existing system vat on kernel restart', async () => {
      kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      kernel = await makeTestKernel(kernelDatabase, true, {
        systemVats: [makeSystemVatConfig('test-system')],
      });

      // Get initial subcluster info
      const initialSubclusters = kernel.getSubclusters();
      expect(initialSubclusters).toHaveLength(1);
      const initialSubclusterId = initialSubclusters[0]!.id;
      const initialRoot = kernel.getSystemVatRoot('test-system');
      expect(initialRoot).toBeDefined();

      // Stop kernel but keep database
      await kernel.stop();
      // eslint-disable-next-line require-atomic-updates
      kernel = undefined;

      // Restart kernel with same system vat config (resetStorage = false)
      // eslint-disable-next-line require-atomic-updates
      kernel = await makeTestKernel(kernelDatabase, false, {
        systemVats: [makeSystemVatConfig('test-system')],
      });

      // System vat should be relaunched with new subcluster
      const newSubclusters = kernel.getSubclusters();
      expect(newSubclusters).toHaveLength(1);
      const newSubclusterId = newSubclusters[0]!.id;

      // Subcluster ID should be different (terminated and relaunched)
      expect(newSubclusterId).not.toBe(initialSubclusterId);

      // System vat should still be accessible
      const newRoot = kernel.getSystemVatRoot('test-system');
      expect(newRoot).toBeDefined();
      expect(newRoot).not.toBe(initialRoot);

      const result = await kernel.queueMessage(newRoot!, 'hasKernelFacet', []);
      await waitUntilQuiescent();
      expect(kunser(result)).toBe(true);
    });

    // TODO: We are terminating system vats on restart, so baggage data is not persisted.
    // This will be fixed.
    it.fails('persists baggage data across kernel restarts', async () => {
      kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      kernel = await makeTestKernel(kernelDatabase, true, {
        systemVats: [makeSystemVatConfig('test-system')],
      });

      const root = kernel.getSystemVatRoot('test-system');
      expect(root).toBeDefined();

      // Store data in baggage during first incarnation
      const testKey = 'persistent-data';
      const testValue = 'hello from first incarnation';
      await kernel.queueMessage(root!, 'storeToBaggage', [testKey, testValue]);
      await waitUntilQuiescent();

      // Verify data was stored
      const storedResult = await kernel.queueMessage(root!, 'getFromBaggage', [
        testKey,
      ]);
      await waitUntilQuiescent();
      expect(kunser(storedResult)).toBe(testValue);

      // Stop kernel but keep database
      await kernel.stop();
      // eslint-disable-next-line require-atomic-updates
      kernel = undefined;

      // Restart kernel with same system vat config (resetStorage = false)
      // eslint-disable-next-line require-atomic-updates
      kernel = await makeTestKernel(kernelDatabase, false, {
        systemVats: [makeSystemVatConfig('test-system')],
      });

      // Get new root after relaunch
      const newRoot = kernel.getSystemVatRoot('test-system');
      expect(newRoot).toBeDefined();

      // Verify baggage data persisted across restart
      const persistedResult = await kernel.queueMessage(
        newRoot!,
        'getFromBaggage',
        [testKey],
      );
      await waitUntilQuiescent();
      expect(kunser(persistedResult)).toBe(testValue);

      // Verify key exists check works
      const hasKeyResult = await kernel.queueMessage(
        newRoot!,
        'hasBaggageKey',
        [testKey],
      );
      await waitUntilQuiescent();
      expect(kunser(hasKeyResult)).toBe(true);

      // Verify non-existent key returns false
      const noKeyResult = await kernel.queueMessage(newRoot!, 'hasBaggageKey', [
        'non-existent-key',
      ]);
      await waitUntilQuiescent();
      expect(kunser(noKeyResult)).toBe(false);
    });
  });

  describe('multiple system vats', () => {
    it('launches multiple system vats at kernel initialization', async () => {
      kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      kernel = await makeTestKernel(kernelDatabase, true, {
        systemVats: [
          makeSystemVatConfig('system-1'),
          makeSystemVatConfig('system-2'),
        ],
      });

      // Both system vats should have roots
      const root1 = kernel.getSystemVatRoot('system-1');
      const root2 = kernel.getSystemVatRoot('system-2');
      expect(root1).toBeDefined();
      expect(root2).toBeDefined();
      expect(root1).not.toBe(root2);

      // Both should have kernelFacet
      const result1 = await kernel.queueMessage(root1!, 'hasKernelFacet', []);
      await waitUntilQuiescent();
      expect(kunser(result1)).toBe(true);

      const result2 = await kernel.queueMessage(root2!, 'hasKernelFacet', []);
      await waitUntilQuiescent();
      expect(kunser(result2)).toBe(true);

      // Should have two subclusters
      expect(kernel.getSubclusters()).toHaveLength(2);
    });
  });
});
