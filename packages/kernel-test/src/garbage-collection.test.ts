import '@ocap/shims/endoify';
import { Kernel, kunser, makeKernelStore } from '@ocap/kernel';
import type { ClusterConfig, KRef, KernelStore, VatId } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';
import { makeSQLKernelDatabase } from '@ocap/store/sqlite/nodejs';
import { waitUntilQuiescent } from '@ocap/utils';
import { expect, beforeEach, describe, it } from 'vitest';

import {
  getBundleSpec,
  makeKernel,
  parseReplyBody,
  runTestVats,
} from './utils.ts';

/**
 * Make a test subcluster with vats for GC testing
 *
 * @returns The test subcluster
 */
function makeTestSubcluster(): ClusterConfig {
  return {
    bootstrap: 'exporter',
    forceReset: true,
    vats: {
      exporter: {
        bundleSpec: getBundleSpec('exporter-vat'),
        parameters: {
          name: 'Exporter',
        },
      },
      importer: {
        bundleSpec: getBundleSpec('importer-vat'),
        parameters: {
          name: 'Importer',
        },
      },
    },
  };
}

describe('Garbage Collection', () => {
  let kernel: Kernel;
  let kernelDatabase: KernelDatabase;
  let kernelStore: KernelStore;
  let exporterKRef: KRef;
  let importerKRef: KRef;
  let exporterVatId: VatId;
  let importerVatId: VatId;

  beforeEach(async () => {
    kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    kernelStore = makeKernelStore(kernelDatabase);
    kernel = await makeKernel(kernelDatabase, true);
    await runTestVats(kernel, makeTestSubcluster());

    const vats = kernel.getVats();
    exporterVatId = vats.find(
      (rows) => rows.config.parameters?.name === 'Exporter',
    )?.id as VatId;
    importerVatId = vats.find(
      (rows) => rows.config.parameters?.name === 'Importer',
    )?.id as VatId;
    exporterKRef = kernelStore.erefToKref(exporterVatId, 'o+0') as KRef;
    importerKRef = kernelStore.erefToKref(importerVatId, 'o+0') as KRef;
  });

  it('objects are tracked with reference counts', async () => {
    const objectId = 'test-object';
    // Create an object in the exporter vat
    const createObjectData = await kernel.queueMessageFromKernel(
      exporterKRef,
      'createObject',
      [objectId],
    );
    const createObjectRef = createObjectData.slots[0] as KRef;
    // Verify initial reference counts from database
    const initialRefCounts = kernelStore.getObjectRefCount(createObjectRef);
    expect(initialRefCounts.reachable).toBe(3);
    expect(initialRefCounts.recognizable).toBe(3);
    // Send the object to the importer vat
    const objectRef = kunser(createObjectData);
    await kernel.queueMessageFromKernel(importerKRef, 'storeImport', [
      objectRef,
    ]);
    await waitUntilQuiescent();
    // Check that the object is reachable from the exporter vat
    const exporterReachable = kernelStore.getReachableFlag(
      exporterVatId,
      createObjectRef,
    );
    expect(exporterReachable).toBe(true);
    // Check that the object is reachable as a promise from the importer vat
    const importerKref = kernelStore.erefToKref(importerVatId, 'p-1') as KRef;
    expect(kernelStore.hasCListEntry(importerVatId, importerKref)).toBe(true);
    expect(kernelStore.getRefCount(importerKref)).toBe(2);
    // Use the object
    const useResult = await kernel.queueMessageFromKernel(
      importerKRef,
      'useImport',
      [],
    );
    await waitUntilQuiescent();
    expect(parseReplyBody(useResult.body)).toBe(objectId);
  });

  it('should trigger GC syscalls through bringOutYourDead', async () => {
    // Create an object in the exporter vat with a known ID
    const objectId = 'test-object';
    const createObjectData = await kernel.queueMessageFromKernel(
      exporterKRef,
      'createObject',
      [objectId],
    );
    const createObjectRef = createObjectData.slots[0] as KRef;

    // Store initial reference count information
    const initialRefCounts = kernelStore.getObjectRefCount(createObjectRef);
    expect(initialRefCounts.reachable).toBe(3);
    expect(initialRefCounts.recognizable).toBe(3);

    // Store the reference in the importer vat
    const objectRef = kunser(createObjectData);
    await kernel.queueMessageFromKernel(importerKRef, 'storeImport', [
      objectRef,
      objectId,
    ]);
    await waitUntilQuiescent();

    // Verify object is tracked in both vats
    const importerHasObject = await kernel.queueMessageFromKernel(
      importerKRef,
      'listImportedObjects',
      [],
    );
    expect(parseReplyBody(importerHasObject.body)).toContain(objectId);

    const exporterHasObject = await kernel.queueMessageFromKernel(
      exporterKRef,
      'isObjectPresent',
      [objectId],
    );
    expect(parseReplyBody(exporterHasObject.body)).toBe(true);

    // Make a weak reference to the object in the importer vat
    // This should eventually trigger dropImports when GC runs
    await kernel.queueMessageFromKernel(importerKRef, 'makeWeak', [objectId]);
    await waitUntilQuiescent();

    // Schedule reap to trigger bringOutYourDead on next crank
    kernel.reapVats((vatId) => vatId === importerVatId);

    // Run 3 cranks to allow bringOutYourDead to be processed
    for (let i = 0; i < 3; i++) {
      await kernel.queueMessageFromKernel(importerKRef, 'noop', []);
      await waitUntilQuiescent(500);
    }

    // Check reference counts after dropImports
    const afterWeakRefCounts = kernelStore.getObjectRefCount(createObjectRef);
    expect(afterWeakRefCounts.reachable).toBe(2);
    expect(afterWeakRefCounts.recognizable).toBe(3);

    // Now completely forget the import in the importer vat
    // This should trigger retireImports when GC runs
    await kernel.queueMessageFromKernel(importerKRef, 'forgetImport', []);
    await waitUntilQuiescent();

    // Schedule another reap
    kernel.reapVats((vatId) => vatId === importerVatId);

    for (let i = 0; i < 3; i++) {
      await kernel.queueMessageFromKernel(importerKRef, 'noop', []);
      await waitUntilQuiescent(500);
    }

    // Check reference counts after retireImports
    const afterForgetRefCounts = kernelStore.getObjectRefCount(createObjectRef);
    expect(afterForgetRefCounts.reachable).toBe(2);
    expect(afterForgetRefCounts.recognizable).toBe(2);

    // Now forget the object in the exporter vat
    // This should trigger retireExports when GC runs
    await kernel.queueMessageFromKernel(exporterKRef, 'forgetObject', [
      objectId,
    ]);
    await waitUntilQuiescent();

    // Schedule a final reap
    kernel.reapVats((vatId) => vatId === exporterVatId);

    // Run a crank to ensure GC completes
    await kernel.queueMessageFromKernel(exporterKRef, 'noop', []);
    await waitUntilQuiescent(50);

    // Verify the object has been completely removed
    const exporterFinalCheck = await kernel.queueMessageFromKernel(
      exporterKRef,
      'isObjectPresent',
      [objectId],
    );
    expect(parseReplyBody(exporterFinalCheck.body)).toBe(false);
  }, 40000);
});
