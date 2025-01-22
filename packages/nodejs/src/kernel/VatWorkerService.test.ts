import '@ocap/shims/endoify';

import type { VatId } from '@ocap/kernel';
import { NodeWorkerMultiplexer } from '@ocap/streams';
import { makeCounter } from '@ocap/utils';
import { describe, expect, it } from 'vitest';

import { NodejsVatWorkerService } from './VatWorkerService.js';
import { getTestWorkerFile } from '../../test/workers';

describe('NodejsVatWorkerService', () => {
  it('constructs an instance without any arguments', () => {
    const instance = new NodejsVatWorkerService();
    expect(instance).toBeInstanceOf(NodejsVatWorkerService);
  });

  const vatIdCounter = makeCounter();
  const getTestVatId = (): VatId => `v${vatIdCounter()}`;

  describe('launch', () => {
    it('creates a NodeWorker and returns a NodeWorkerMultiplexer', async () => {
      const service = new NodejsVatWorkerService(
        getTestWorkerFile('hello-world'),
      );
      const testVatId: VatId = getTestVatId();
      const multiplexer = await service.launch(testVatId);

      expect(multiplexer).toBeInstanceOf(NodeWorkerMultiplexer);
    });
  });

  describe('terminate', () => {
    it('terminates the target vat', async () => {
      const service = new NodejsVatWorkerService(
        getTestWorkerFile('hello-world'),
      );
      const testVatId: VatId = getTestVatId();

      await service.launch(testVatId);
      expect(service.workers.has(testVatId)).toBe(true);

      await service.terminate(testVatId);
      expect(service.workers.has(testVatId)).toBe(false);
    });

    it('throws when terminating an unknown vat', async () => {
      const service = new NodejsVatWorkerService(
        getTestWorkerFile('hello-world'),
      );
      const testVatId: VatId = getTestVatId();

      await expect(
        async () => await service.terminate(testVatId),
      ).rejects.toThrow(/No worker found/u);
    });
  });

  describe('terminateAll', () => {
    it('terminates all vats', async () => {
      const service = new NodejsVatWorkerService(
        getTestWorkerFile('hello-world'),
      );
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
