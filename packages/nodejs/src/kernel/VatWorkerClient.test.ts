import '@ocap/shims/endoify';

import type { VatId } from '@ocap/kernel';
import { makeCounter } from '@ocap/utils';
import { describe, expect, it, vi } from 'vitest';

import { NodejsVatWorkerClient } from './VatWorkerClient.ts';

const mocks = vi.hoisted(() => ({
  worker: {
    once: (_: string, callback: () => unknown) => {
      callback();
    },
    terminate: vi.fn(async () => undefined),
  },
  stream: {
    synchronize: vi.fn(async () => undefined).mockResolvedValue(undefined),
    return: vi.fn(async () => ({})),
  },
}));

vi.mock('@ocap/streams', () => ({
  NodeWorkerDuplexStream: vi.fn(() => mocks.stream),
}));

vi.mock('node:worker_threads', () => ({
  Worker: vi.fn(() => mocks.worker),
}));

describe('NodejsVatWorkerClient', () => {
  it('constructs an instance without any arguments', () => {
    const instance = new NodejsVatWorkerClient({});
    expect(instance).toBeInstanceOf(NodejsVatWorkerClient);
  });

  const workerFilePath = 'unused';
  const vatIdCounter = makeCounter();
  const getTestVatId = (): VatId => `v${vatIdCounter()}`;

  describe('launch', () => {
    it('creates a NodeWorker and returns a NodeWorkerDuplexStream', async () => {
      const service = new NodejsVatWorkerClient({
        workerFilePath,
      });
      const testVatId: VatId = getTestVatId();
      const stream = await service.launch(testVatId);

      expect(stream).toStrictEqual(mocks.stream);
    });

    it('rejects if synchronize fails', async () => {
      const rejected = 'test-reject-value';
      mocks.stream.synchronize.mockRejectedValue(rejected);
      const service = new NodejsVatWorkerClient({ workerFilePath });
      const testVatId: VatId = getTestVatId();
      await expect(async () => await service.launch(testVatId)).rejects.toThrow(
        rejected,
      );
    });
  });

  describe('terminate', () => {
    it('terminates the target vat', async () => {
      const service = new NodejsVatWorkerClient({
        workerFilePath,
      });
      const testVatId: VatId = getTestVatId();

      await service.launch(testVatId);
      expect(service.workers.has(testVatId)).toBe(true);

      await service.terminate(testVatId);
      expect(service.workers.has(testVatId)).toBe(false);
    });

    it('throws when terminating an unknown vat', async () => {
      const service = new NodejsVatWorkerClient({
        workerFilePath,
      });
      const testVatId: VatId = getTestVatId();

      await expect(
        async () => await service.terminate(testVatId),
      ).rejects.toThrow(/No worker found/u);
    });
  });

  describe('terminateAll', () => {
    it('terminates all vats', async () => {
      const service = new NodejsVatWorkerClient({
        workerFilePath,
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
