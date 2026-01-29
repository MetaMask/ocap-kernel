import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeHostVat } from './index.ts';

// Mock SystemVatSupervisor
const mockDeliverFn = vi.fn();
const mockMakeFn = vi.fn();

vi.mock('@metamask/ocap-kernel/vats', () => ({
  SystemVatSupervisor: {
    make: (...args: unknown[]) => mockMakeFn(...args),
  },
}));

describe('makeHostVat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeliverFn.mockResolvedValue(null);
    mockMakeFn.mockResolvedValue({ deliver: mockDeliverFn });
  });

  it('returns config, connect, and kernelFacetPromise', () => {
    const result = makeHostVat();

    expect(result.config).toBeDefined();
    expect(result.connect).toBeTypeOf('function');
    expect(result.kernelFacetPromise).toBeInstanceOf(Promise);
  });

  describe('config', () => {
    it('has kernelHost as default name', () => {
      const { config } = makeHostVat();

      expect(config.name).toBe('kernelHost');
    });

    it('uses custom name when provided', () => {
      const { config } = makeHostVat({ name: 'customHost' });

      expect(config.name).toBe('customHost');
    });

    it('has transport with deliver and setSyscallHandler', () => {
      const { config } = makeHostVat();

      expect(config.transport).toBeDefined();
      expect(config.transport.deliver).toBeTypeOf('function');
      expect(config.transport.setSyscallHandler).toBeTypeOf('function');
      expect(config.transport.awaitConnection).toBeTypeOf('function');
    });
  });

  describe('connect', () => {
    it('throws if syscall handler not set', () => {
      const { connect } = makeHostVat();

      expect(() => connect()).toThrow(
        'Cannot connect: syscall handler not set. Was Kernel.make() called with this config?',
      );
    });
  });

  describe('transport', () => {
    it('deliver waits for supervisor then calls it', async () => {
      const { config, connect } = makeHostVat();

      // Set the syscall handler (simulating kernel setup)
      config.transport.setSyscallHandler(vi.fn());

      const delivery = {
        type: 'message' as const,
        methargs: { body: '[]', slots: [] },
        result: 'p-1',
        target: 'o+0',
      };

      // Start the delivery (it will wait for supervisor)
      const deliverPromise = config.transport.deliver(delivery);

      // Start the supervisor - this should unblock the delivery
      connect();

      // Now the delivery should complete
      await deliverPromise;

      expect(mockDeliverFn).toHaveBeenCalledWith(delivery);
    });
  });
});
