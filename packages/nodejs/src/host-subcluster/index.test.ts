import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeHostSubcluster } from './index.ts';

// Mock SystemVatSupervisor
const mockStart = vi.fn();
const mockDeliver = vi.fn();

vi.mock('@metamask/ocap-kernel/vats', () => {
  return {
    SystemVatSupervisor: class MockSystemVatSupervisor {
      start = mockStart;

      deliver = mockDeliver;
    },
    makeSyscallHandlerHolder: vi.fn(() => ({ handler: null })),
  };
});

describe('makeHostSubcluster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStart.mockResolvedValue(null);
    mockDeliver.mockResolvedValue(null);
  });

  it('returns config, start, and getKernelFacet', () => {
    const result = makeHostSubcluster();

    expect(result.config).toBeDefined();
    expect(result.start).toBeTypeOf('function');
    expect(result.getKernelFacet).toBeTypeOf('function');
  });

  describe('config', () => {
    it('has kernelHost as bootstrap vat', () => {
      const { config } = makeHostSubcluster();

      expect(config.bootstrap).toBe('kernelHost');
    });

    it('has vatTransports with kernelHost transport', () => {
      const { config } = makeHostSubcluster();

      expect(config.vatTransports).toHaveLength(1);
      expect(config.vatTransports[0]?.name).toBe('kernelHost');
      expect(config.vatTransports[0]?.transport).toBeDefined();
      expect(config.vatTransports[0]?.transport.deliver).toBeTypeOf('function');
      expect(config.vatTransports[0]?.transport.setSyscallHandler).toBeTypeOf(
        'function',
      );
    });
  });

  describe('start', () => {
    it('creates and starts the supervisor', async () => {
      const { start } = makeHostSubcluster();

      await start();

      expect(mockStart).toHaveBeenCalled();
    });

    it('throws if supervisor start throws', async () => {
      mockStart.mockRejectedValueOnce(new Error('Start failed'));

      const { start } = makeHostSubcluster();

      await expect(start()).rejects.toThrow('Start failed');
    });
  });

  describe('getKernelFacet', () => {
    it('throws if called before kernel facet is available', () => {
      const { getKernelFacet } = makeHostSubcluster();

      expect(() => getKernelFacet()).toThrow(
        'Kernel facet not available. Ensure start() was called and kernel has bootstrapped.',
      );
    });
  });

  describe('transport', () => {
    it('deliver waits for supervisor then calls it', async () => {
      const { config, start } = makeHostSubcluster();

      const delivery = {
        type: 'message' as const,
        methargs: { body: '[]', slots: [] },
        result: 'p-1',
        target: 'o+0',
      };

      // Start the delivery (it will wait for supervisor)
      const deliverPromise =
        config.vatTransports[0]?.transport.deliver(delivery);

      // Start the supervisor - this should unblock the delivery
      await start();

      // Now the delivery should complete
      await deliverPromise;

      expect(mockDeliver).toHaveBeenCalledWith(delivery);
    });
  });
});
