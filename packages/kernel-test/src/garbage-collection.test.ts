import '@ocap/shims/endoify';
import { Kernel, kunser, makeKernelStore } from '@ocap/kernel';
import type { ClusterConfig, KRef, KernelStore, VatId } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';
import { makeSQLKernelDatabase } from '@ocap/store/sqlite/nodejs';
import { waitUntilQuiescent } from '@ocap/utils';
import { expect, beforeEach, afterEach, describe, it } from 'vitest';

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
    bundles: null,
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

describe('Garbage Collection E2E Tests', () => {
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

  afterEach(async () => {
    console.log('$$$ DB', kernelDatabase.executeQuery('SELECT * FROM kv'));
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
    expect(initialRefCounts.reachable).toBe(1);
    expect(initialRefCounts.recognizable).toBe(1);
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
    expect(kernelStore.getRefCount(importerKref)).toBe(1);
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
    // 1. Create an object in the exporter vat with a known ID
    const objectId = 'test-object';
    const createObjectData = await kernel.queueMessageFromKernel(
      exporterKRef,
      'createObject',
      [objectId],
    );
    const createObjectRef = createObjectData.slots[0] as KRef;

    // Store initial reference count information
    const initialRefCounts = kernelStore.getObjectRefCount(createObjectRef);
    console.log('Initial ref counts:', createObjectRef, initialRefCounts);
    expect(initialRefCounts.reachable).toBe(1);
    expect(initialRefCounts.recognizable).toBe(1);

    // 2. Store the reference in the importer vat
    const objectRef = kunser(createObjectData);
    await kernel.queueMessageFromKernel(importerKRef, 'storeImport', [
      objectRef,
      objectId,
    ]);
    await waitUntilQuiescent();

    // Get reference counts after storing in importer
    const afterStoreRefCounts = kernelStore.getObjectRefCount(createObjectRef);
    console.log('After store ref counts:', objectRef, afterStoreRefCounts);

    // 3. Verify object is tracked in both vats
    const importerHasObject = await kernel.queueMessageFromKernel(
      importerKRef,
      'listImportedObjects',
      [],
    );
    console.log('$$$ importerHasObject', importerHasObject);
    expect(parseReplyBody(importerHasObject.body)).toContain(objectId);

    const exporterHasObject = await kernel.queueMessageFromKernel(
      exporterKRef,
      'isObjectPresent',
      [objectId],
    );
    console.log('$$$ exporterHasObject', exporterHasObject);
    expect(parseReplyBody(exporterHasObject.body)).toBe(true);

    // 4. Make a weak reference to the object in the importer vat
    // This should eventually trigger dropImports when GC runs
    await kernel.queueMessageFromKernel(importerKRef, 'makeWeak', [objectId]);
    await waitUntilQuiescent();

    console.log('$$$ kernelStore.getGCActions(1)', kernelStore.getGCActions());

    // // 5. Schedule reap to trigger bringOutYourDead on next crank
    kernel.reapAllVats();

    // // 6. Run a crank to allow bringOutYourDead to be processed
    await kernel.queueMessageFromKernel(exporterKRef, 'noop', []);
    await waitUntilQuiescent(100);

    console.log('$$$ kernelStore.getGCActions(2)', kernelStore.getGCActions());

    // // Check reference counts after dropImports
    const afterWeakRefCounts = kernelStore.getObjectRefCount(createObjectRef);
    console.log('After weak ref counts:', afterWeakRefCounts);
    expect(afterWeakRefCounts.reachable).toBe(0);
    expect(afterWeakRefCounts.recognizable).toBe(1);

    // 7. Now completely forget the import in the importer vat
    // This should trigger retireImports when GC runs
    await kernel.queueMessageFromKernel(importerKRef, 'forgetImport', []);
    await waitUntilQuiescent();

    // 8. Schedule another reap
    kernel.reapAllVats();

    // 9. Run a crank to allow bringOutYourDead to be processed
    await kernel.queueMessageFromKernel(importerKRef, 'noop', []);
    await waitUntilQuiescent(100);

    // Check reference counts after retireImports (both should be decreased)
    const afterForgetRefCounts = kernelStore.getObjectRefCount(createObjectRef);
    expect(afterForgetRefCounts.reachable).toBe(0);
    expect(afterForgetRefCounts.recognizable).toBe(0);

    // // 10. Now forget the object in the exporter vat
    // // This should trigger retireExports when GC runs
    await kernel.queueMessageFromKernel(exporterKRef, 'forgetObject', [
      objectId,
    ]);
    await waitUntilQuiescent();

    // 11. Schedule a final reap
    kernel.reapAllVats();

    // 12. Run multiple cranks to ensure GC completes
    for (let i = 0; i < 3; i++) {
      await kernel.queueMessageFromKernel(exporterKRef, 'noop', []);
      await waitUntilQuiescent(50);
    }

    // Verify the object has been completely removed
    const exporterFinalCheck = await kernel.queueMessageFromKernel(
      exporterKRef,
      'isObjectPresent',
      [objectId],
    );
    console.log('$$$ exporterFinalCheck', exporterFinalCheck);
    expect(parseReplyBody(exporterFinalCheck.body)).toBe(false);

    // Check if reference still exists in the kernel store at all
    // const refExists = kernelStore.kernelRefExists(createObjectRef);
    // expect(refExists).toBe(false);

    // // 13. Test abandonExports by creating a new object and forcing its removal
    // const abandonObjectId = 'abandon-test';
    // const abandonObjData = await kernel.queueMessageFromKernel(
    //   exporterKRef,
    //   'createObject',
    //   [abandonObjectId],
    // );
    // console.log('$$$ abandonObjData', abandonObjData);
    // const abandonObjRef = abandonObjData.slots[0] as KRef;

    // // Store in importer to make it reachable from both vats
    // await kernel.queueMessageFromKernel(importerKRef, 'storeImport', [
    //   abandonObjRef,
    //   abandonObjectId,
    // ]);
    // await waitUntilQuiescent();

    // // Verify it's reachable from both vats
    // const abandonRefCounts = kernelStore.getObjectRefCount(abandonObjRef);
    // expect(abandonRefCounts.reachable).toBe(1);

    // // Force remove in exporter (this simulates abandonExports)
    // await kernel.queueMessageFromKernel(exporterKRef, 'forgetObject', [
    //   abandonObjectId,
    // ]);
    // await waitUntilQuiescent();

    // // Schedule reap to trigger abandonExports
    // kernelStore.scheduleReap(exporterVatId);

    // // Run multiple cranks to ensure GC completes
    // for (let i = 0; i < 3; i++) {
    //   await kernel.queueMessageFromKernel(exporterKRef, 'noop', []);
    //   await waitUntilQuiescent(50);
    // }

    // // Verify object is gone from exporter
    // const exporterAbandonCheck = await kernel.queueMessageFromKernel(
    //   exporterKRef,
    //   'isObjectPresent',
    //   [abandonObjectId],
    // );
    // console.log('$$$ exporterAbandonCheck', exporterAbandonCheck);
    // expect(parseReplyBody(exporterAbandonCheck.body)).toBe(false);

    // // But it should still be in the importer's list
    // const importerAbandonCheck = await kernel.queueMessageFromKernel(
    //   importerKRef,
    //   'listImportedObjects',
    //   [],
    // );
    // console.log('$$$ importerAbandonCheck', importerAbandonCheck);
    // expect(parseReplyBody(importerAbandonCheck.body)).toContain(
    //   abandonObjectId,
    // );

    // // However, using the object should now fail
    // try {
    //   await kernel.queueMessageFromKernel(importerKRef, 'useImport', [
    //     abandonObjectId,
    //   ]);
    //   // Should not reach here
    //   expect(false).toBe(true);
    // } catch (error) {
    //   // We expect an error
    //   // eslint-disable-next-line vitest/no-conditional-expect
    //   expect(error).toBeDefined();
    // }
  });
});
