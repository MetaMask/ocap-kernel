import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Kernel } from '@metamask/ocap-kernel';
import type { ClusterConfig } from '@metamask/ocap-kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getBundleSpec,
  makeKernel,
  makeTestLogger,
  runTestVats,
} from './utils.ts';

/**
 * Make a test subcluster with vats for subcluster testing
 *
 * @param name - The name of the subcluster
 * @returns A cluster configuration for testing
 */
function makeTestSubcluster(name: string): ClusterConfig {
  return {
    bootstrap: 'alice',
    forceReset: true,
    vats: {
      alice: {
        bundleSpec: getBundleSpec('subcluster-vat'),
        parameters: {
          name: 'Alice',
          subcluster: name,
        },
      },
      bob: {
        bundleSpec: getBundleSpec('subcluster-vat'),
        parameters: {
          name: 'Bob',
          subcluster: name,
        },
      },
    },
  };
}

describe('Subcluster functionality', () => {
  let kernel: Kernel;

  beforeEach(async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const { logger } = makeTestLogger();
    kernel = await makeKernel(kernelDatabase, true, logger);
  });

  it(
    'can create and manage multiple subclusters',
    { timeout: 10000 },
    async () => {
      // Create first subcluster
      const subcluster1 = makeTestSubcluster('subcluster1');
      const bootstrapResult1 = await runTestVats(kernel, subcluster1);
      expect(bootstrapResult1).toBe('bootstrap complete');

      // Create second subcluster
      const subcluster2 = makeTestSubcluster('subcluster2');
      const bootstrapResult2 = await runTestVats(kernel, subcluster2);
      expect(bootstrapResult2).toBe('bootstrap complete');

      // Verify subclusters exist
      const subclusters = kernel.getSubclusters();
      expect(subclusters).toHaveLength(2);
      expect(subclusters[0]?.id).toBe('s1');
      expect(subclusters[1]?.id).toBe('s2');

      // Verify vats are in correct subclusters
      const vats = kernel.getVats();
      expect(vats).toHaveLength(4); // 2 vats per subcluster

      const subcluster1Vats = kernel.getSubclusterVats('s1');
      expect(subcluster1Vats).toHaveLength(2);
      expect(subcluster1Vats).toContain('v1');
      expect(subcluster1Vats).toContain('v2');

      const subcluster2Vats = kernel.getSubclusterVats('s2');
      expect(subcluster2Vats).toHaveLength(2);
      expect(subcluster2Vats).toContain('v3');
      expect(subcluster2Vats).toContain('v4');
    },
  );

  it('can terminate a subcluster', { timeout: 10000 }, async () => {
    // Create subcluster
    const subcluster = makeTestSubcluster('subcluster1');
    await runTestVats(kernel, subcluster);

    // Verify initial state
    expect(kernel.getSubclusters()).toHaveLength(1);
    expect(kernel.getVats()).toHaveLength(2);

    // Terminate subcluster
    await kernel.terminateSubcluster('s1');

    // Verify subcluster and its vats are gone
    expect(kernel.getSubclusters()).toHaveLength(0);
    expect(kernel.getVats()).toHaveLength(0);
    expect(kernel.getSubcluster('s1')).toBeUndefined();
  });

  it('can reload a subcluster', { timeout: 10000 }, async () => {
    // Create subcluster
    const subcluster = makeTestSubcluster('subcluster1');
    const bootstrapResult1 = await runTestVats(kernel, subcluster);
    expect(bootstrapResult1).toBe('bootstrap complete');

    // Get initial vat IDs
    const initialVats = kernel.getVats();
    const initialVatIds = initialVats.map((vat) => vat.id);

    await waitUntilQuiescent();

    // Reload Subcluster
    await kernel.reloadSubcluster('s1');

    // Verify vats were reloaded
    const reloadedVats = kernel.getVats();
    expect(reloadedVats).toHaveLength(2);

    // Vat IDs should be different after reload
    const reloadedVatIds = reloadedVats.map((vat) => vat.id);
    expect(reloadedVatIds).not.toStrictEqual(initialVatIds);
  });

  it(
    'can check if a vat belongs to a subcluster',
    { timeout: 10000 },
    async () => {
      // Create subcluster
      const subcluster = makeTestSubcluster('subcluster1');
      await runTestVats(kernel, subcluster);

      // Verify vat membership
      expect(kernel.isVatInSubcluster('v1', 's1')).toBe(true);
      expect(kernel.isVatInSubcluster('v2', 's1')).toBe(true);
      expect(kernel.isVatInSubcluster('v1', 's2')).toBe(false);
    },
  );

  it('can handle subcluster operations with non-existent subclusters', async () => {
    expect(() => kernel.getSubclusterVats('nonexistent')).toThrow(
      'Subcluster does not exist',
    );
    await expect(kernel.terminateSubcluster('nonexistent')).rejects.toThrow(
      'Subcluster does not exist',
    );
    await expect(kernel.reloadSubcluster('nonexistent')).rejects.toThrow(
      'Subcluster does not exist',
    );
  });

  it('can reload the entire kernel', { timeout: 10000 }, async () => {
    // Create multiple subclusters
    const subcluster1 = makeTestSubcluster('subcluster1');
    const subcluster2 = makeTestSubcluster('subcluster2');
    await runTestVats(kernel, subcluster1);
    await runTestVats(kernel, subcluster2);

    // Verify initial state
    expect(kernel.getSubclusters()).toHaveLength(2);
    expect(kernel.getVats()).toHaveLength(4);
    const initialVatIds = kernel.getVats().map((vat) => vat.id);

    // Reload kernel
    await kernel.reload();

    // Verify subclusters were reloaded
    expect(kernel.getSubclusters()).toHaveLength(2);
    expect(kernel.getVats()).toHaveLength(4);

    // Verify vat IDs are different after reload
    const reloadedVatIds = kernel.getVats().map((vat) => vat.id);
    expect(reloadedVatIds).toHaveLength(4);
    expect(reloadedVatIds).not.toStrictEqual(initialVatIds);
  });

  it(
    'can handle subcluster operations with terminated vats',
    { timeout: 10000 },
    async () => {
      // Create subcluster
      const subcluster = makeTestSubcluster('subcluster1');
      await runTestVats(kernel, subcluster);

      // Terminate a vat
      await kernel.terminateVat('v2');
      kernel.collectGarbage();

      // Verify vat is removed from subcluster
      const subclusterVats = kernel.getSubclusterVats('s1');
      console.log('subclusterVats', subclusterVats);
      expect(subclusterVats).toHaveLength(1);
      expect(subclusterVats).not.toContain('v2');

      // reload subcluster should recreate all vats
      const reloadedSubcluster = await kernel.reloadSubcluster('s1');
      console.log('reloadedSubcluster', reloadedSubcluster);
      expect(reloadedSubcluster).toBeDefined();
      expect(reloadedSubcluster.vats).toHaveLength(2);
    },
  );
});
