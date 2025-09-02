import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import type { KRef } from '@metamask/ocap-kernel';
import { makeKernelStore } from '@metamask/ocap-kernel';
import { describe, expect, it, beforeEach } from 'vitest';

import {
  getBundleSpec,
  makeKernel,
  makeTestLogger,
  runTestVats,
} from './utils.ts';

describe('Syscall Validation & Revoked Objects', { timeout: 30_000 }, () => {
  let logger: ReturnType<typeof makeTestLogger>;

  beforeEach(async () => {
    logger = makeTestLogger();
  });

  it.each([
    ['invalid-kref' as KRef, 'invalid reference context'],
    ['' as KRef, 'incrementRefCount called with empty kref'],
  ])(
    'should throw "%s" error for malformed KRef "%s"',
    async (kref, expectedError) => {
      const kernelDatabase = await makeSQLKernelDatabase({
        dbFilename: ':memory:',
      });
      const kernel = await makeKernel(
        kernelDatabase,
        true,
        logger.logger.subLogger({ tags: ['test'] }),
      );

      await expect(
        kernel.queueMessage(kref, 'testMethod', ['test']),
      ).rejects.toThrow(expectedError);

      // Verify kernel is still operational after malformed requests
      const workingSubcluster = {
        bootstrap: 'test',
        vats: {
          test: {
            bundleSpec: getBundleSpec('subcluster-vat'),
            parameters: { name: 'TestVat' },
          },
        },
      };
      const result = await runTestVats(kernel, workingSubcluster);
      expect(result).toBe('bootstrap complete');
      expect(kernel.getVats()).toHaveLength(1);
    },
  );

  it('should handle message delivery to revoked objects', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const kernel = await makeKernel(
      kernelDatabase,
      true,
      logger.logger.subLogger({ tags: ['test'] }),
    );
    const kernelStore = makeKernelStore(kernelDatabase);
    // Launch subcluster with exporter vat for object creation
    const subcluster = {
      bootstrap: 'exporter',
      vats: {
        exporter: {
          bundleSpec: getBundleSpec('exporter-vat'),
          parameters: { name: 'Exporter' },
        },
      },
    };
    await runTestVats(kernel, subcluster);
    await waitUntilQuiescent();
    const vats = kernel.getVats();
    const exporterVat = vats[0];
    const exporterKRef = kernelStore.getRootObject(
      exporterVat?.id as string,
    ) as KRef;
    // Create an object in the exporter vat
    const objectId = 'test-revocation-object';
    const createResult = await kernel.queueMessage(
      exporterKRef,
      'createObject',
      [objectId],
    );
    const objectKRef = createResult.slots[0] as KRef;
    // Verify object is accessible initially
    const initialAccess = await kernel.queueMessage(objectKRef, 'getValue', []);
    expect(initialAccess.body).toContain(objectId);
    // Revoke the object
    kernelStore.setRevoked(objectKRef, true);
    await waitUntilQuiescent();
    // Try to send message to revoked object
    const revokedResult = await kernel.queueMessage(objectKRef, 'getValue', []);
    // Should get proper error response for revoked object
    expect(revokedResult.body).toContain('revoked object');
    // Verify kernel doesn't crash and exporter vat remains operational
    const exporterStatus = await kernel.queueMessage(exporterKRef, 'noop', []);
    expect(exporterStatus.body).toContain('noop');
  });

  it('should reject promises with appropriate error for revoked objects', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const kernel = await makeKernel(
      kernelDatabase,
      true,
      logger.logger.subLogger({ tags: ['test'] }),
    );
    const kernelStore = makeKernelStore(kernelDatabase);
    const subcluster = {
      bootstrap: 'exporter',
      vats: {
        exporter: {
          bundleSpec: getBundleSpec('exporter-vat'),
          parameters: { name: 'Exporter' },
        },
      },
    };
    await runTestVats(kernel, subcluster);
    await waitUntilQuiescent();
    const vats = kernel.getVats();
    const exporterVat = vats[0];
    const exporterKRef = kernelStore.getRootObject(
      exporterVat?.id as string,
    ) as KRef;
    // Create an object
    const objectId = 'promise-revocation-test';
    const createResult = await kernel.queueMessage(
      exporterKRef,
      'createObject',
      [objectId],
    );
    const objectKRef = createResult.slots[0] as KRef;
    // Revoke the object
    kernelStore.setRevoked(objectKRef, true);
    await waitUntilQuiescent();
    // Send message to revoked object that would return a promise
    const promiseResult = await kernel.queueMessage(objectKRef, 'getValue', []);
    // Verify the promise is rejected with revocation error
    expect(promiseResult.body).toContain('revoked object');
    // Verify exporter vat is still operational
    const exporterStatus = await kernel.queueMessage(exporterKRef, 'noop', []);
    expect(exporterStatus.body).toContain('noop');
    // Verify kernel can handle multiple revoked object accesses
    for (let i = 0; i < 5; i++) {
      const multipleResult = await kernel.queueMessage(
        objectKRef,
        'getValue',
        [],
      );
      expect(multipleResult.body).toContain('revoked object');
    }
    // Verify kernel remains stable
    const finalStatus = await kernel.queueMessage(exporterKRef, 'noop', []);
    expect(finalStatus.body).toContain('noop');
  });

  it('should handle multiple revoked objects correctly', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const kernel = await makeKernel(
      kernelDatabase,
      true,
      logger.logger.subLogger({ tags: ['test'] }),
    );
    const kernelStore = makeKernelStore(kernelDatabase);

    const subcluster = {
      bootstrap: 'exporter',
      vats: {
        exporter: {
          bundleSpec: getBundleSpec('exporter-vat'),
          parameters: { name: 'Exporter' },
        },
      },
    };

    await runTestVats(kernel, subcluster);
    await waitUntilQuiescent();

    const vats = kernel.getVats();
    const exporterVat = vats[0];
    const exporterKRef = kernelStore.getRootObject(
      exporterVat?.id as string,
    ) as KRef;

    // Create multiple objects
    const objectIds = ['obj1', 'obj2', 'obj3'];
    const objectKRefs: KRef[] = [];

    for (const objectId of objectIds) {
      const createResult = await kernel.queueMessage(
        exporterKRef,
        'createObject',
        [objectId],
      );
      objectKRefs.push(createResult.slots[0] as KRef);
    }

    // Revoke all objects
    for (const objectKRef of objectKRefs) {
      kernelStore.setRevoked(objectKRef, true);
    }
    await waitUntilQuiescent();

    // Try to access all revoked objects
    const revokedResults = await Promise.all(
      objectKRefs.map(async (objectKRef) =>
        kernel.queueMessage(objectKRef, 'getValue', []),
      ),
    );

    // All should return revocation errors
    revokedResults.forEach((result) => {
      expect(result.body).toContain('revoked object');
    });

    // Verify exporter vat is still operational
    const exporterStatus = await kernel.queueMessage(exporterKRef, 'noop', []);
    expect(exporterStatus.body).toContain('noop');

    // Verify kernel is stable
    expect(kernel.getVats()).toHaveLength(1);
  });
});
