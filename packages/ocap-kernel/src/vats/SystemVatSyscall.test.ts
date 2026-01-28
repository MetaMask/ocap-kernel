import type {
  Message,
  VatOneResolution,
  VatSyscallObject,
} from '@agoric/swingset-liveslots';
import type { Logger } from '@metamask/logger';
import type { MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KernelQueue } from '../KernelQueue.ts';
import type { KernelStore } from '../store/index.ts';
import type { SystemVatId } from '../types.ts';
import { SystemVatSyscall } from './SystemVatSyscall.ts';

describe('SystemVatSyscall', () => {
  let kernelQueue: KernelQueue;
  let kernelStore: KernelStore;
  let logger: Logger;
  let isActive: () => boolean;
  let systemVatSyscall: SystemVatSyscall;
  const systemVatId: SystemVatId = 'sv0';

  beforeEach(() => {
    kernelQueue = {
      enqueueSend: vi.fn(),
      resolvePromises: vi.fn(),
      enqueueNotify: vi.fn(),
    } as unknown as KernelQueue;
    kernelStore = {
      translateSyscallVtoK: vi.fn((_: string, vso: VatSyscallObject) => vso),
      getKernelPromise: vi.fn(),
      addPromiseSubscriber: vi.fn(),
      clearReachableFlag: vi.fn(),
      getReachableFlag: vi.fn(),
      forgetKref: vi.fn(),
    } as unknown as KernelStore;
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      subLogger: vi.fn(() => logger),
    } as unknown as Logger;
    isActive = vi.fn(() => true);
    systemVatSyscall = new SystemVatSyscall({
      systemVatId,
      kernelQueue,
      kernelStore,
      isActive,
      logger,
    });
  });

  it('enqueues run for send syscall', () => {
    const target = 'o+1';
    const message = {} as unknown as Message;
    const vso = ['send', target, message] as unknown as VatSyscallObject;
    systemVatSyscall.handleSyscall(vso);
    expect(kernelQueue.enqueueSend).toHaveBeenCalledWith(target, message);
  });

  it('calls resolvePromises for resolve syscall', () => {
    const resolution = ['kp1', false, {}] as unknown as VatOneResolution;
    const vso = ['resolve', [resolution]] as unknown as VatSyscallObject;
    systemVatSyscall.handleSyscall(vso);
    expect(kernelQueue.resolvePromises).toHaveBeenCalledWith(systemVatId, [
      resolution,
    ]);
  });

  describe('subscribe syscall', () => {
    it('subscribes to unresolved promise', () => {
      (
        kernelStore.getKernelPromise as unknown as MockInstance
      ).mockReturnValueOnce({
        state: 'unresolved',
      });
      const vso = ['subscribe', 'kp1'] as unknown as VatSyscallObject;
      systemVatSyscall.handleSyscall(vso);
      expect(kernelStore.addPromiseSubscriber).toHaveBeenCalledWith(
        systemVatId,
        'kp1',
      );
    });

    it('notifies for resolved promise', () => {
      (
        kernelStore.getKernelPromise as unknown as MockInstance
      ).mockReturnValueOnce({
        state: 'fulfilled',
      });
      const vso = ['subscribe', 'kp1'] as unknown as VatSyscallObject;
      systemVatSyscall.handleSyscall(vso);
      expect(kernelQueue.enqueueNotify).toHaveBeenCalledWith(
        systemVatId,
        'kp1',
      );
    });
  });

  describe('dropImports syscall', () => {
    it('clears reachable flags for valid imports', () => {
      const vso = [
        'dropImports',
        ['o-1', 'o-2'],
      ] as unknown as VatSyscallObject;
      systemVatSyscall.handleSyscall(vso);
      expect(kernelStore.clearReachableFlag).toHaveBeenCalledWith(
        systemVatId,
        'o-1',
      );
      expect(kernelStore.clearReachableFlag).toHaveBeenCalledWith(
        systemVatId,
        'o-2',
      );
    });

    it.each([
      [
        'o+1',
        `system vat ${systemVatId} issued invalid syscall dropImports for o+1`,
      ],
      [
        'p-1',
        `system vat ${systemVatId} issued invalid syscall dropImports for p-1`,
      ],
    ])('returns error for invalid ref %s', (ref, errMsg) => {
      (
        kernelStore.translateSyscallVtoK as unknown as MockInstance
      ).mockImplementationOnce(() => {
        throw new Error(errMsg);
      });
      const vso = ['dropImports', [ref]] as unknown as VatSyscallObject;
      const result = systemVatSyscall.handleSyscall(vso);
      expect(result).toStrictEqual(['error', errMsg]);
    });
  });

  describe('retireImports syscall', () => {
    it('forgets kref when not reachable', () => {
      (
        kernelStore.getReachableFlag as unknown as MockInstance
      ).mockReturnValueOnce(false);
      const vso = ['retireImports', ['o-1']] as unknown as VatSyscallObject;
      systemVatSyscall.handleSyscall(vso);
      expect(kernelStore.forgetKref).toHaveBeenCalledWith(systemVatId, 'o-1');
    });

    it('returns error if still reachable', () => {
      (
        kernelStore.translateSyscallVtoK as unknown as MockInstance
      ).mockImplementationOnce(() => {
        (
          kernelStore.getReachableFlag as unknown as MockInstance
        ).mockReturnValueOnce(true);
        throw new Error('syscall.retireImports but o-1 is still reachable');
      });
      const vso = ['retireImports', ['o-1']] as unknown as VatSyscallObject;
      const result = systemVatSyscall.handleSyscall(vso);
      expect(result).toStrictEqual([
        'error',
        'syscall.retireImports but o-1 is still reachable',
      ]);
    });
  });

  describe('exportCleanup syscalls', () => {
    it('retires exports when not reachable', () => {
      (
        kernelStore.getReachableFlag as unknown as MockInstance
      ).mockReturnValueOnce(false);
      const vso = ['retireExports', ['o+1']] as unknown as VatSyscallObject;
      systemVatSyscall.handleSyscall(vso);
      expect(kernelStore.forgetKref).toHaveBeenCalledWith(systemVatId, 'o+1');
      expect(logger.debug).toHaveBeenCalledWith(
        'retireExports: deleted object o+1',
      );
    });

    it('returns error for reachable exports', () => {
      (
        kernelStore.translateSyscallVtoK as unknown as MockInstance
      ).mockImplementationOnce(() => {
        (
          kernelStore.getReachableFlag as unknown as MockInstance
        ).mockReturnValueOnce(true);
        throw new Error('syscall.retireExports but o+1 is still reachable');
      });
      const vso = ['retireExports', ['o+1']] as unknown as VatSyscallObject;
      const result = systemVatSyscall.handleSyscall(vso);
      expect(result).toStrictEqual([
        'error',
        'syscall.retireExports but o+1 is still reachable',
      ]);
    });

    it('abandons exports without reachability check', () => {
      const vso = ['abandonExports', ['o+1']] as unknown as VatSyscallObject;
      systemVatSyscall.handleSyscall(vso);
      expect(kernelStore.forgetKref).toHaveBeenCalledWith(systemVatId, 'o+1');
      expect(logger.debug).toHaveBeenCalledWith(
        'abandonExports: deleted object o+1',
      );
    });

    it('returns error for invalid abandonExports refs', () => {
      (
        kernelStore.translateSyscallVtoK as unknown as MockInstance
      ).mockImplementationOnce(() => {
        throw new Error(
          `system vat ${systemVatId} issued invalid syscall abandonExports for o-1`,
        );
      });
      const vso = ['abandonExports', ['o-1']] as unknown as VatSyscallObject;
      const result = systemVatSyscall.handleSyscall(vso);
      expect(result).toStrictEqual([
        'error',
        `system vat ${systemVatId} issued invalid syscall abandonExports for o-1`,
      ]);
    });
  });

  describe('exit syscall', () => {
    it('records vat termination request', () => {
      const vso = [
        'exit',
        true,
        { message: 'error' },
      ] as unknown as VatSyscallObject;
      systemVatSyscall.handleSyscall(vso);
      expect(systemVatSyscall.vatRequestedTermination).toStrictEqual({
        reject: true,
        info: { message: 'error' },
      });
    });
  });

  describe('error handling', () => {
    it('handles system vat not active error', () => {
      (isActive as unknown as MockInstance).mockReturnValueOnce(false);
      const vso = ['send', 'o+1', {}] as unknown as VatSyscallObject;
      const result = systemVatSyscall.handleSyscall(vso);

      expect(result).toStrictEqual(['error', 'system vat not found']);
      expect(systemVatSyscall.illegalSyscall).toBeDefined();
    });

    it('handles general syscall errors', () => {
      const error = new Error('test error');
      (
        kernelStore.translateSyscallVtoK as unknown as MockInstance
      ).mockImplementationOnce(() => {
        throw error;
      });

      const vso = ['send', 'o+1', {}] as unknown as VatSyscallObject;
      const result = systemVatSyscall.handleSyscall(vso);

      expect(result).toStrictEqual(['error', 'test error']);
      expect(logger.error).toHaveBeenCalledWith(
        `Fatal syscall error in system vat ${systemVatId}`,
        error,
      );
    });
  });

  describe('unsupported syscalls', () => {
    it.each([
      ['vatstoreGet'],
      ['vatstoreGetNextKey'],
      ['vatstoreSet'],
      ['vatstoreDelete'],
      ['callNow'],
    ])('%s warns about unsupported syscall', (op) => {
      const spy = vi.spyOn(logger, 'warn');
      const vso = [op, []] as unknown as VatSyscallObject;
      systemVatSyscall.handleSyscall(vso);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('unsupported syscall'),
        vso,
      );
      spy.mockRestore();
    });
  });

  describe('unknown syscalls', () => {
    it('warns about unknown syscall', () => {
      const spy = vi.spyOn(logger, 'warn');
      const vso = ['unknownOp', []] as unknown as VatSyscallObject;
      systemVatSyscall.handleSyscall(vso);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('unknown syscall'),
        vso,
      );
      spy.mockRestore();
    });
  });

  describe('logging', () => {
    it('is disabled if logger is undefined', () => {
      const logSpy = vi.spyOn(console, 'log');
      const syscallWithoutLogger = new SystemVatSyscall({
        systemVatId,
        kernelQueue,
        kernelStore,
        isActive,
      });
      syscallWithoutLogger.handleSyscall([
        'send',
        'o+1',
        {},
      ] as VatSyscallObject);
      expect(logSpy).not.toHaveBeenCalled();
      expect(logger.log).not.toHaveBeenCalled();
    });
  });

  describe('systemVatId property', () => {
    it('exposes the system vat ID', () => {
      expect(systemVatSyscall.systemVatId).toBe(systemVatId);
    });
  });
});
