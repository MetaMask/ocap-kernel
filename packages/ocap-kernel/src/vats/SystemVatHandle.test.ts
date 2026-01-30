import type { VatOneResolution } from '@agoric/swingset-liveslots';
import type { Logger } from '@metamask/logger';
import type { MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KernelQueue } from '../KernelQueue.ts';
import type { KernelStore } from '../store/index.ts';
import type { DeliveryObject, Message, SystemVatId, VRef } from '../types.ts';
import type { SystemVatDeliverFn } from './SystemVatHandle.ts';
import { SystemVatHandle } from './SystemVatHandle.ts';

describe('SystemVatHandle', () => {
  let kernelStore: KernelStore;
  let kernelQueue: KernelQueue;
  let logger: Logger;
  let deliver: SystemVatDeliverFn;
  let systemVatHandle: SystemVatHandle;
  const systemVatId: SystemVatId = 'sv0';

  beforeEach(() => {
    kernelStore = {
      translateSyscallVtoK: vi.fn((_, vso) => vso),
      getKernelPromise: vi.fn(() => ({ state: 'unresolved' })),
      addPromiseSubscriber: vi.fn(),
      clearReachableFlag: vi.fn(),
      getReachableFlag: vi.fn(),
      forgetKref: vi.fn(),
      getPromisesByDecider: vi.fn(() => []),
      deleteEndpoint: vi.fn(),
    } as unknown as KernelStore;
    kernelQueue = {
      enqueueSend: vi.fn(),
      resolvePromises: vi.fn(),
      enqueueNotify: vi.fn(),
    } as unknown as KernelQueue;
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      subLogger: vi.fn(() => logger),
    } as unknown as Logger;
    deliver = vi.fn().mockResolvedValue(null);
    systemVatHandle = new SystemVatHandle({
      systemVatId,
      kernelStore,
      kernelQueue,
      deliver,
      logger,
    });
  });

  describe('constructor', () => {
    it('exposes the system vat ID', () => {
      expect(systemVatHandle.systemVatId).toBe(systemVatId);
    });
  });

  describe('getSyscallHandler', () => {
    it('returns a function that handles syscalls', () => {
      const handler = systemVatHandle.getSyscallHandler();
      expect(typeof handler).toBe('function');

      // Test that it can handle a syscall
      handler([
        'send',
        'o+1',
        { methargs: { body: '[]', slots: [] }, result: 'p-1' },
      ]);
      expect(kernelQueue.enqueueSend).toHaveBeenCalled();
    });
  });

  describe('deliverMessage', () => {
    it('calls deliver with message delivery', async () => {
      const target: VRef = 'o+0';
      const message: Message = {
        methargs: { body: '["test"]', slots: [] },
        result: 'p-1',
      };

      await systemVatHandle.deliverMessage(target, message);

      expect(deliver).toHaveBeenCalledWith([
        'message',
        target,
        { methargs: message.methargs, result: message.result },
      ]);
    });

    it('passes message without result property as-is', async () => {
      const target: VRef = 'o+0';
      const message: Message = {
        methargs: { body: '["test"]', slots: [] },
      };

      await systemVatHandle.deliverMessage(target, message);

      expect(deliver).toHaveBeenCalledWith([
        'message',
        target,
        { methargs: message.methargs },
      ]);
    });

    it('returns crank results with didDelivery', async () => {
      const target: VRef = 'o+0';
      const message: Message = {
        methargs: { body: '[]', slots: [] },
      };

      const result = await systemVatHandle.deliverMessage(target, message);

      expect(result.didDelivery).toBe(systemVatId);
    });
  });

  describe('deliverNotify', () => {
    it('calls deliver with notify delivery', async () => {
      const resolutions: VatOneResolution[] = [
        ['p-1', false, { body: '"resolved"', slots: [] }],
      ];

      await systemVatHandle.deliverNotify(resolutions);

      expect(deliver).toHaveBeenCalledWith(['notify', resolutions]);
    });

    it('returns crank results with didDelivery', async () => {
      const resolutions: VatOneResolution[] = [
        ['p-1', false, { body: '"resolved"', slots: [] }],
      ];

      const result = await systemVatHandle.deliverNotify(resolutions);

      expect(result.didDelivery).toBe(systemVatId);
    });
  });

  describe('deliverDropExports', () => {
    it('calls deliver with dropExports delivery', async () => {
      const vrefs: VRef[] = ['o+1', 'o+2'];

      await systemVatHandle.deliverDropExports(vrefs);

      expect(deliver).toHaveBeenCalledWith(['dropExports', vrefs]);
    });
  });

  describe('deliverRetireExports', () => {
    it('calls deliver with retireExports delivery', async () => {
      const vrefs: VRef[] = ['o+1', 'o+2'];

      await systemVatHandle.deliverRetireExports(vrefs);

      expect(deliver).toHaveBeenCalledWith(['retireExports', vrefs]);
    });
  });

  describe('deliverRetireImports', () => {
    it('calls deliver with retireImports delivery', async () => {
      const vrefs: VRef[] = ['o-1', 'o-2'];

      await systemVatHandle.deliverRetireImports(vrefs);

      expect(deliver).toHaveBeenCalledWith(['retireImports', vrefs]);
    });
  });

  describe('deliverBringOutYourDead', () => {
    it('calls deliver with bringOutYourDead delivery', async () => {
      await systemVatHandle.deliverBringOutYourDead();

      expect(deliver).toHaveBeenCalledWith(['bringOutYourDead']);
    });
  });

  describe('crank results', () => {
    it('returns abort and terminate on delivery error', async () => {
      (deliver as unknown as MockInstance).mockResolvedValueOnce(
        'delivery failed',
      );

      const result = await systemVatHandle.deliverMessage('o+0', {
        methargs: { body: '[]', slots: [] },
      });

      expect(result.abort).toBe(true);
      expect(result.terminate).toStrictEqual({
        vatId: systemVatId,
        reject: true,
        info: expect.objectContaining({
          body: expect.stringContaining('delivery failed'),
        }),
      });
    });

    it('returns abort and terminate on illegal syscall', async () => {
      // Create a new handle with a syscall that triggers illegal syscall
      const illegalSyscallKernelStore = {
        ...kernelStore,
        translateSyscallVtoK: vi.fn(() => {
          throw new Error('illegal');
        }),
      } as unknown as KernelStore;

      const handle = new SystemVatHandle({
        systemVatId,
        kernelStore: illegalSyscallKernelStore,
        kernelQueue,
        deliver: vi.fn().mockImplementation(async (del: DeliveryObject) => {
          // Simulate the vat making a syscall during delivery
          if (del[0] === 'message') {
            handle.getSyscallHandler()([
              'send',
              'o+1',
              { methargs: { body: '[]', slots: [] }, result: 'p-1' },
            ]);
          }
          return null;
        }),
        logger,
      });

      const result = await handle.deliverMessage('o+0', {
        methargs: { body: '[]', slots: [] },
      });

      expect(result.abort).toBe(true);
      expect(result.terminate).toBeDefined();
      expect(result.terminate?.reject).toBe(true);
    });

    it('returns terminate without abort on graceful exit', async () => {
      // Create a handle that will request termination gracefully
      const handle = new SystemVatHandle({
        systemVatId,
        kernelStore,
        kernelQueue,
        deliver: vi.fn().mockImplementation(async () => {
          // Simulate the vat calling syscall.exit(false, info)
          handle.getSyscallHandler()([
            'exit',
            false,
            { body: '"goodbye"', slots: [] },
          ]);
          return null;
        }),
        logger,
      });

      const result = await handle.deliverMessage('o+0', {
        methargs: { body: '[]', slots: [] },
      });

      expect(result.abort).toBeUndefined();
      expect(result.terminate).toStrictEqual({
        vatId: systemVatId,
        reject: false,
        info: { body: '"goodbye"', slots: [] },
      });
    });
  });

  describe('logging', () => {
    it('creates handle without logger', () => {
      const handleWithoutLogger = new SystemVatHandle({
        systemVatId,
        kernelStore,
        kernelQueue,
        deliver,
      });

      // Handle is created successfully
      expect(handleWithoutLogger.systemVatId).toBe(systemVatId);
    });
  });
});
