import '@ocap/shims/endoify';

import type { VatSupervisor } from '@ocap/kernel';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { makeMultiplexer } from './make-multiplexer.js';
import { startVatWorker as startVatWorkerDecl } from './make-vat-worker.js';

type MakeVatWorker = typeof startVatWorkerDecl;

describe('startVatWorker', () => {
  const testVatId = 'v0';
  let startVatWorker: MakeVatWorker;
  let mockMakeMultiplexer: Mock<typeof makeMultiplexer>;
  let MockVatSupervisor: Mock<() => VatSupervisor>;

  beforeEach(async () => {
    mockMakeMultiplexer = vi.fn().mockImplementation(() => ({
      start: vi.fn().mockResolvedValue(undefined),
      return: vi.fn().mockResolvedValue(undefined),
      createChannel: vi.fn(),
    }));
    MockVatSupervisor = vi.fn().mockImplementation(() => ({
      terminate: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('@ocap/streams', () => ({
      NodeWorkerMultiplexer: vi.fn(),
    }));
    vi.doMock('@ocap/kernel', () => ({
      VatSupervisor: MockVatSupervisor,
      isVatCommand: vi.fn(),
    }));
    vi.resetModules();
    startVatWorker = (await import('./make-vat-worker.js')).startVatWorker;
  });

  it('creates a multiplexer and channel and calls start', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await startVatWorker(testVatId, mockMakeMultiplexer, {} as any);

    expect(mockMakeMultiplexer).toHaveBeenCalledOnce();
    expect(mockMakeMultiplexer.mock.results.at(0)).toBeDefined();
    expect(
      mockMakeMultiplexer.mock.results.at(0)?.value.createChannel,
    ).toHaveBeenCalledOnce();
    expect(
      mockMakeMultiplexer.mock.results.at(0)?.value.start,
    ).toHaveBeenCalledOnce();
  });

  it('creates a VatSupervisor', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await startVatWorker(testVatId, mockMakeMultiplexer, {} as any);

    expect(MockVatSupervisor.mock.instances).toHaveLength(1);
  });
});
