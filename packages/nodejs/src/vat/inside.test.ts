import '@ocap/shims/endoify';

import { VatSupervisor } from '@ocap/kernel';
import { NodeWorkerMultiplexer } from '@ocap/streams';
import { makeLogger } from '@ocap/utils';
import { describe, expect, it, vi } from 'vitest';

import { main } from './inside.js';

vi.mock('node:worker_threads', () => ({
  parentPort: {},
}));

vi.mock('@ocap/kernel', () => {
  const MockVatSupervisor = vi.fn();
  vi.spyOn(MockVatSupervisor.prototype, 'evaluate').mockImplementation();
  return {
    VatSupervisor: MockVatSupervisor,
  };
});

vi.mock('@ocap/streams', () => {
  const MockNodeWorkerMultiplexer = vi.fn();
  vi.spyOn(MockNodeWorkerMultiplexer.prototype, 'start')
    .mockImplementation()
    .mockResolvedValue(undefined);
  vi.spyOn(
    MockNodeWorkerMultiplexer.prototype,
    'createChannel',
  ).mockImplementation();

  return {
    NodeWorkerMultiplexer: MockNodeWorkerMultiplexer,
  };
});

describe('inside', () => {
  it('reads vat id from NODE_VAT_ID', async () => {
    const vatId = 'v20';
    vi.stubEnv('NODE_VAT_ID', vatId);
    await main();
    expect(makeLogger).toHaveBeenCalledWith(`[${vatId} (inside)]`);
  });

  it('creates a VatSupervisor and call its evaluate method', async () => {
    const MockNodeWorkerMultiplexer = vi.mocked(NodeWorkerMultiplexer);
    const MockVatSupervisor = vi.mocked(VatSupervisor);

    await main();

    expect(MockNodeWorkerMultiplexer).toHaveBeenCalledOnce();
    expect(MockNodeWorkerMultiplexer.mock.instances.at(0)).toBeDefined();
    expect(
      MockNodeWorkerMultiplexer.mock.instances.at(0)?.start,
    ).toHaveBeenCalledOnce();
    expect(
      MockNodeWorkerMultiplexer.mock.instances.at(0)?.createChannel,
    ).toHaveBeenCalledTimes(2);

    expect(MockVatSupervisor).toHaveBeenCalledOnce();
    expect(MockVatSupervisor.mock.instances.at(0)).toBeDefined();
    expect(
      MockVatSupervisor.mock.instances.at(0)?.evaluate,
    ).toHaveBeenCalledWith('["Hello", "world!"].join(" ");');
  });
});
