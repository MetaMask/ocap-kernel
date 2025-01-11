import '@ocap/shims/endoify';

import * as ocapKernel from '@ocap/kernel';
import * as ocapStreams from '@ocap/streams';
import * as ocapUtils from '@ocap/utils';
import { describe, expect, it, vi } from 'vitest';

import { main } from './vat-worker.js';

vi.mock('node:worker_threads', () => ({
  parentPort: '{- parentPort -}',
}));

vi.mock('@ocap/kernel', async (importOriginal: () => Promise<object>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    VatSupervisor: vi.fn(() => ({
      evaluate: vi.fn(),
    })),
  }
});

vi.mock('@ocap/streams', () => ({
  NodeWorkerMultiplexer: vi.fn(() => ({
    start: vi.fn().mockRejectedValue(undefined),
    createChannel: vi.fn(),
  })),
}));

describe('inside', () => {
  it('creates a VatSupervisor and call its evaluate method', async () => {
    const spyNodeWorkerMultiplexer = vi.spyOn(ocapStreams, 'NodeWorkerMultiplexer');
    const spyVatSupervisor = vi.spyOn(ocapKernel, 'VatSupervisor');

    const vatId = 'v20';
    vi.stubEnv('NODE_VAT_ID', vatId);

    await main();

    expect(spyNodeWorkerMultiplexer).toHaveBeenCalledOnce();
    expect(spyNodeWorkerMultiplexer.mock.instances.at(0)).toBeDefined();
    expect(
      spyNodeWorkerMultiplexer.mock.instances.at(0)?.start,
    ).toHaveBeenCalledOnce();
    expect(
      spyNodeWorkerMultiplexer.mock.instances.at(0)?.createChannel,
    ).toHaveBeenCalledTimes(2);

    expect(spyVatSupervisor).toHaveBeenCalledOnce();
    expect(spyVatSupervisor).toHaveBeenCalledWith({
      id: vatId,
    });
    expect(spyVatSupervisor.mock.instances.at(0)).toBeDefined();
    expect(
      spyVatSupervisor.mock.instances.at(0)?.evaluate,
    ).toHaveBeenCalledWith('["Hello", "world!"].join(" ");');
  });
});
