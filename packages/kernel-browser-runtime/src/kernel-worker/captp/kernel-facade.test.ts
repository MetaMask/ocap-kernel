import '@ocap/repo-tools/test-utils/mock-endoify';

import type {
  ClusterConfig,
  Kernel,
  KernelStatus,
  KRef,
  VatId,
} from '@metamask/ocap-kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeKernelFacade } from './kernel-facade.ts';
import type { KernelFacade } from './kernel-facade.ts';

const makeClusterConfig = (): ClusterConfig => ({
  bootstrap: 'v1',
  vats: {
    v1: {
      bundleSpec: 'test-source',
    },
  },
});

describe('makeKernelFacade', () => {
  let mockKernel: Kernel;
  let facade: KernelFacade;

  beforeEach(() => {
    mockKernel = {
      launchSubcluster: vi.fn().mockResolvedValue({
        body: '#{"subclusterId":"sc1"}',
        slots: ['ko1'],
      }),
      terminateSubcluster: vi.fn().mockResolvedValue(undefined),
      queueMessage: vi.fn().mockResolvedValue({
        body: '#{"result":"success"}',
        slots: [],
      }),
      getStatus: vi.fn().mockResolvedValue({
        vats: [],
        subclusters: [],
        remoteComms: { isInitialized: false },
      }),
      pingVat: vi.fn().mockResolvedValue('pong'),
    } as unknown as Kernel;

    facade = makeKernelFacade(mockKernel);
  });

  describe('ping', () => {
    it('returns "pong"', async () => {
      const result = await facade.ping();
      expect(result).toBe('pong');
    });
  });

  describe('launchSubcluster', () => {
    it('delegates to kernel with correct arguments', async () => {
      const config = makeClusterConfig();

      await facade.launchSubcluster(config);

      expect(mockKernel.launchSubcluster).toHaveBeenCalledWith(config);
      expect(mockKernel.launchSubcluster).toHaveBeenCalledTimes(1);
    });

    it('returns result from kernel with parsed subclusterId and wrapped kref', async () => {
      const kernelResult = {
        body: '#{"subclusterId":"s1"}',
        slots: ['ko1'],
      };
      vi.mocked(mockKernel.launchSubcluster).mockResolvedValueOnce(
        kernelResult,
      );

      const config = makeClusterConfig();

      const result = await facade.launchSubcluster(config);

      // The facade should parse the CapData and return a LaunchResult
      expect(result).toStrictEqual({
        subclusterId: 's1',
        rootKref: 'ko1',
      });
    });

    it('propagates errors from kernel', async () => {
      const error = new Error('Launch failed');
      vi.mocked(mockKernel.launchSubcluster).mockRejectedValueOnce(error);

      const config = makeClusterConfig();

      await expect(facade.launchSubcluster(config)).rejects.toThrow(error);
    });

    it('throws when kernel returns no capData', async () => {
      vi.mocked(mockKernel.launchSubcluster).mockResolvedValueOnce(
        undefined as unknown as ReturnType<Kernel['launchSubcluster']>,
      );

      const config = makeClusterConfig();

      await expect(facade.launchSubcluster(config)).rejects.toThrow(
        'launchSubcluster: expected capData with root kref',
      );
    });

    it('throws when capData body has no subclusterId', async () => {
      vi.mocked(mockKernel.launchSubcluster).mockResolvedValueOnce({
        body: '#{}',
        slots: ['ko1'],
      });

      const config = makeClusterConfig();

      await expect(facade.launchSubcluster(config)).rejects.toThrow(
        'launchSubcluster: expected subclusterId in body',
      );
    });

    it('throws when capData slots is empty', async () => {
      vi.mocked(mockKernel.launchSubcluster).mockResolvedValueOnce({
        body: '#{"subclusterId":"sc1"}',
        slots: [],
      });

      const config = makeClusterConfig();

      await expect(facade.launchSubcluster(config)).rejects.toThrow(
        'launchSubcluster: expected root kref in slots',
      );
    });
  });

  describe('terminateSubcluster', () => {
    it('delegates to kernel with correct arguments', async () => {
      const subclusterId = 'sc1';

      await facade.terminateSubcluster(subclusterId);

      expect(mockKernel.terminateSubcluster).toHaveBeenCalledWith(subclusterId);
      expect(mockKernel.terminateSubcluster).toHaveBeenCalledTimes(1);
    });

    it('propagates errors from kernel', async () => {
      const error = new Error('Terminate failed');
      vi.mocked(mockKernel.terminateSubcluster).mockRejectedValueOnce(error);

      await expect(facade.terminateSubcluster('sc1')).rejects.toThrow(error);
    });
  });

  describe('queueMessage', () => {
    it('delegates to kernel with correct arguments', async () => {
      const target: KRef = 'ko1';
      const method = 'doSomething';
      const args = ['arg1', { nested: 'value' }];

      await facade.queueMessage(target, method, args);

      expect(mockKernel.queueMessage).toHaveBeenCalledWith(
        target,
        method,
        args,
      );
      expect(mockKernel.queueMessage).toHaveBeenCalledTimes(1);
    });

    it('returns result from kernel', async () => {
      const expectedResult = { body: '#{"answer":42}', slots: [] };
      vi.mocked(mockKernel.queueMessage).mockResolvedValueOnce(expectedResult);

      const result = await facade.queueMessage('ko1', 'compute', []);
      expect(result).toStrictEqual(expectedResult);
    });

    it('propagates errors from kernel', async () => {
      const error = new Error('Queue message failed');
      vi.mocked(mockKernel.queueMessage).mockRejectedValueOnce(error);

      await expect(facade.queueMessage('ko1', 'method', [])).rejects.toThrow(
        error,
      );
    });
  });

  describe('getStatus', () => {
    it('delegates to kernel', async () => {
      await facade.getStatus();

      expect(mockKernel.getStatus).toHaveBeenCalled();
      expect(mockKernel.getStatus).toHaveBeenCalledTimes(1);
    });

    it('returns status from kernel', async () => {
      const expectedStatus: KernelStatus = {
        vats: [],
        subclusters: [],
        remoteComms: { isInitialized: false },
      };

      const result = await facade.getStatus();
      expect(result).toStrictEqual(expectedStatus);
    });

    it('propagates errors from kernel', async () => {
      const error = new Error('Get status failed');
      vi.mocked(mockKernel.getStatus).mockRejectedValueOnce(error);

      await expect(facade.getStatus()).rejects.toThrow(error);
    });
  });

  describe('pingVat', () => {
    it('delegates to kernel with correct vatId', async () => {
      const vatId: VatId = 'v1';

      await facade.pingVat(vatId);

      expect(mockKernel.pingVat).toHaveBeenCalledWith(vatId);
      expect(mockKernel.pingVat).toHaveBeenCalledTimes(1);
    });

    it('returns result from kernel', async () => {
      const result = await facade.pingVat('v1');
      expect(result).toBe('pong');
    });

    it('propagates errors from kernel', async () => {
      const error = new Error('Ping vat failed');
      vi.mocked(mockKernel.pingVat).mockRejectedValueOnce(error);

      await expect(facade.pingVat('v1')).rejects.toThrow(error);
    });
  });
});
