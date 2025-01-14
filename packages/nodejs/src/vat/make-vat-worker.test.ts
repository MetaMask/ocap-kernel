import '@ocap/shims/endoify';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeMultiplexer } from './make-multiplexer.js';
import { makeVatWorker as makeVatWorkerDecl } from './make-vat-worker.js';

type MakeVatWorker = typeof makeVatWorkerDecl;

describe('makeVatWorker', () => {
  const testVatId = 'v0';
  let makeVatWorker: MakeVatWorker;
  let mockMakeMultiplexer: typeof makeMultiplexer;

  beforeEach(async () => {
    mockMakeMultiplexer = vi.fn().mockImplementation(() => ({
      start: vi.fn().mockResolvedValue(undefined),
      return: vi.fn().mockResolvedValue(undefined),
      createChannel: vi.fn(),
    }));
    vi.doMock('@ocap/streams', () => ({
      NodeWorkerMultiplexer: vi.fn(),
    }));
    vi.doMock('@ocap/kernel', () => ({
      VatSupervisor: vi.fn().mockImplementation(() => ({
        terminate: vi.fn().mockResolvedValue(undefined),
      })),
      isVatCommand: vi.fn(),
    }));
    vi.resetModules();
    makeVatWorker = (await import('./make-vat-worker.js')).makeVatWorker;
  });

  it('returns an object with start and stop methods', async () => {
    const vatWorker = makeVatWorker(testVatId, mockMakeMultiplexer);

    expect(vatWorker).toHaveProperty('start');
    expect(vatWorker).toHaveProperty('stop');
  });

  describe('start', () => {
    it('starts the multiplexer', async () => {
      const vatWorker = makeVatWorker(testVatId, mockMakeMultiplexer);

      await vatWorker.start();

      expect(mockMakeMultiplexer.mock.results.at(0)).toBeDefined();
      expect(
        mockMakeMultiplexer.mock.results.at(0).value.start,
      ).toHaveBeenCalledOnce();
    });
  });

  describe('stop', () => {
    it('calls supervisor.terminate and multiplexer.return', async () => {
      const vatWorker = makeVatWorker(testVatId, mockMakeMultiplexer);

      await vatWorker.start();
      await vatWorker.stop();

      expect(mockMakeMultiplexer.mock.results.at(0)).toBeDefined();
      expect(
        mockMakeMultiplexer.mock.results.at(0).value.return,
      ).toHaveBeenCalledOnce();
    });
  });
});
