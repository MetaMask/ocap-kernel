import '@metamask/kernel-shims/endoify';

import { makeCounter } from '@metamask/kernel-utils';
import type { VatId } from '@metamask/ocap-kernel';
import { NodeWorkerDuplexStream } from '@metamask/streams';
import { describe, expect, it, vi } from 'vitest';

import { NodejsVatWorkerService } from '../../src/kernel/VatWorkerService.ts';
import { getTestWorkerFile } from '../get-test-worker.ts';

describe('NodejsVatWorkerService', () => {
  const testWorkerFile = getTestWorkerFile('stream-sync');
  const vatIdCounter = makeCounter();
  const getTestVatId = (): VatId => `v${vatIdCounter()}`;

  describe('launch', () => {
    it('creates a NodeWorker and returns a NodeWorkerDuplexStream', async () => {
      const service = new NodejsVatWorkerService({
        workerFilePath: testWorkerFile,
      });
      const testVatId: VatId = getTestVatId();
      const stream = await service.launch(testVatId);

      expect(stream).toBeInstanceOf(NodeWorkerDuplexStream);
    });

    it('rejects if synchronize fails', async () => {
      const rejected = 'test-reject-value';

      vi.doMock('@metamask/streams', () => ({
        NodeWorkerDuplexStream: vi.fn().mockImplementation(() => ({
          synchronize: vi.fn(() => 'no').mockRejectedValue(rejected),
        })),
      }));
      vi.resetModules();
      const NVWS = (await import('../../src/kernel/VatWorkerService.ts'))
        .NodejsVatWorkerService;

      const service = new NVWS({ workerFilePath: testWorkerFile });
      const testVatId: VatId = getTestVatId();
      await expect(async () => await service.launch(testVatId)).rejects.toThrow(
        rejected,
      );
    });
  });

  describe('terminate', () => {
    it('terminates the target vat', async () => {
      const service = new NodejsVatWorkerService({
        workerFilePath: testWorkerFile,
      });
      const testVatId: VatId = getTestVatId();

      await service.launch(testVatId);
      expect(service.workers.has(testVatId)).toBe(true);

      await service.terminate(testVatId);
      expect(service.workers.has(testVatId)).toBe(false);
    });

    it('throws when terminating an unknown vat', async () => {
      const service = new NodejsVatWorkerService({
        workerFilePath: testWorkerFile,
      });
      const testVatId: VatId = getTestVatId();

      await expect(
        async () => await service.terminate(testVatId),
      ).rejects.toThrow(/No worker found/u);
    });
  });

  describe('terminateAll', () => {
    it('terminates all vats', async () => {
      const service = new NodejsVatWorkerService({
        workerFilePath: testWorkerFile,
      });
      const vatIds: VatId[] = [getTestVatId(), getTestVatId(), getTestVatId()];

      await Promise.all(
        vatIds.map(async (vatId) => await service.launch(vatId)),
      );

      expect(Array.from(service.workers.values())).toHaveLength(vatIds.length);

      await service.terminateAll();

      expect(Array.from(service.workers.values())).toHaveLength(0);
    });
  });
});
