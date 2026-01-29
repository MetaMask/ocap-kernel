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

    it('throws if supervisor start returns error', async () => {
      mockStart.mockResolvedValueOnce('Some error');

      const { start } = makeHostSubcluster();

      await expect(start()).rejects.toThrow(
        'Failed to start host subcluster supervisor: Some error',
      );
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
    it('deliver throws if supervisor not initialized', async () => {
      const { config } = makeHostSubcluster();

      await expect(
        config.vatTransports[0]?.transport.deliver({
          type: 'message',
          methargs: { body: '[]', slots: [] },
          result: 'p-1',
          target: 'o+0',
        }),
      ).rejects.toThrow('Supervisor not initialized');
    });

    it('deliver calls supervisor after start', async () => {
      const { config, start } = makeHostSubcluster();
      await start();

      const delivery = {
        type: 'message' as const,
        methargs: { body: '[]', slots: [] },
        result: 'p-1',
        target: 'o+0',
      };
      await config.vatTransports[0]?.transport.deliver(delivery);

      expect(mockDeliver).toHaveBeenCalledWith(delivery);
    });
  });
});
