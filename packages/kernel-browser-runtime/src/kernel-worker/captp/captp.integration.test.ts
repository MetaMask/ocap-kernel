// Real endoify needed for CapTP and E() to work properly
import '@ocap/nodejs/endoify-ts';

import { E } from '@endo/eventual-send';
import type { ClusterConfig, Kernel } from '@metamask/ocap-kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeKernelCapTP } from './kernel-captp.ts';
import { makeBackgroundCapTP } from '../../background-captp.ts';
import type { CapTPMessage } from '../../background-captp.ts';

/**
 * Integration tests for CapTP communication between background and kernel endpoints.
 *
 * These tests validate that the two CapTP endpoints can communicate correctly
 * and that E() works properly with the kernel facade remote presence.
 */
describe('CapTP Integration', () => {
  let mockKernel: Kernel;
  let kernelCapTP: ReturnType<typeof makeKernelCapTP>;
  let backgroundCapTP: ReturnType<typeof makeBackgroundCapTP>;

  beforeEach(() => {
    // Create mock kernel with method implementations
    mockKernel = {
      launchSubcluster: vi.fn().mockResolvedValue({
        subclusterId: 'sc1',
        bootstrapRootKref: 'ko1',
        bootstrapResult: {
          body: '#{"result":"ok"}',
          slots: [],
        },
      }),
      terminateSubcluster: vi.fn().mockResolvedValue(undefined),
      queueMessage: vi.fn().mockResolvedValue({
        body: '#{"result":"message-sent"}',
        slots: [],
      }),
      getStatus: vi.fn().mockResolvedValue({
        vats: [{ id: 'v1', name: 'test-vat' }],
        subclusters: ['sc1'],
        remoteComms: false,
      }),
      pingVat: vi.fn().mockResolvedValue('pong'),
    } as unknown as Kernel;

    // Wire up CapTP endpoints to dispatch messages synchronously to each other
    // This simulates direct message passing for testing

    // Kernel-side: exposes facade as bootstrap
    kernelCapTP = makeKernelCapTP({
      kernel: mockKernel,
      send: (message: CapTPMessage) => {
        // Dispatch synchronously for testing
        backgroundCapTP.dispatch(message);
      },
    });

    // Background-side: gets remote presence of kernel
    backgroundCapTP = makeBackgroundCapTP({
      send: (message: CapTPMessage) => {
        // Dispatch synchronously for testing
        kernelCapTP.dispatch(message);
      },
    });
  });

  describe('bootstrap', () => {
    it('background can get kernel remote presence via getKernel', async () => {
      // Request the kernel facade - with synchronous dispatch, this resolves immediately
      const kernel = await backgroundCapTP.getKernel();
      expect(kernel).toBeDefined();
    });
  });

  describe('ping', () => {
    it('e(kernel).ping() returns "pong"', async () => {
      // Get kernel remote presence
      const kernel = await backgroundCapTP.getKernel();

      // Call ping via E()
      const result = await E(kernel).ping();
      expect(result).toBe('pong');
    });
  });

  describe('getStatus', () => {
    it('e(kernel).getStatus() returns status from mock kernel', async () => {
      // Get kernel remote presence
      const kernel = await backgroundCapTP.getKernel();

      // Call getStatus via E()
      const result = await E(kernel).getStatus();
      expect(result).toStrictEqual({
        vats: [{ id: 'v1', name: 'test-vat' }],
        subclusters: ['sc1'],
        remoteComms: false,
      });

      expect(mockKernel.getStatus).toHaveBeenCalled();
    });
  });

  describe('launchSubcluster', () => {
    it('e(kernel).launchSubcluster() passes arguments correctly', async () => {
      const config: ClusterConfig = {
        bootstrap: 'v1',
        vats: {
          v1: {
            bundleSpec: 'test-source',
          },
        },
      };

      // Get kernel remote presence
      const kernel = await backgroundCapTP.getKernel();

      // Call launchSubcluster via E()
      const result = await E(kernel).launchSubcluster(config);

      // The kernel facade now returns LaunchResult instead of CapData
      expect(result).toStrictEqual({
        subclusterId: 'sc1',
        rootKref: 'ko1',
      });

      expect(mockKernel.launchSubcluster).toHaveBeenCalledWith(config);
    });
  });

  describe('terminateSubcluster', () => {
    it('e(kernel).terminateSubcluster() delegates to kernel', async () => {
      // Get kernel remote presence
      const kernel = await backgroundCapTP.getKernel();

      // Call terminateSubcluster via E()
      await E(kernel).terminateSubcluster('sc1');
      expect(mockKernel.terminateSubcluster).toHaveBeenCalledWith('sc1');
    });
  });

  describe('queueMessage', () => {
    it('e(kernel).queueMessage() passes arguments correctly', async () => {
      const target = 'ko1';
      const method = 'doSomething';
      const args = ['arg1', { nested: 'value' }];

      // Get kernel remote presence
      const kernel = await backgroundCapTP.getKernel();

      // Call queueMessage via E()
      const result = await E(kernel).queueMessage(target, method, args);
      expect(result).toStrictEqual({
        body: '#{"result":"message-sent"}',
        slots: [],
      });

      expect(mockKernel.queueMessage).toHaveBeenCalledWith(
        target,
        method,
        args,
      );
    });
  });

  describe('pingVat', () => {
    it('e(kernel).pingVat() delegates to kernel', async () => {
      // Get kernel remote presence
      const kernel = await backgroundCapTP.getKernel();

      // Call pingVat via E()
      const result = await E(kernel).pingVat('v1');
      expect(result).toBe('pong');

      expect(mockKernel.pingVat).toHaveBeenCalledWith('v1');
    });
  });

  describe('error propagation', () => {
    it('errors from kernel methods propagate to background', async () => {
      const error = new Error('Kernel operation failed');
      vi.mocked(mockKernel.getStatus).mockRejectedValueOnce(error);

      // Get kernel remote presence
      const kernel = await backgroundCapTP.getKernel();

      // Call getStatus which will fail
      await expect(E(kernel).getStatus()).rejects.toThrow(
        'Kernel operation failed',
      );
    });
  });
});
