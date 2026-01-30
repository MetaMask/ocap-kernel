import type {
  Message,
  VatOneResolution,
  VatSyscallObject,
} from '@agoric/swingset-liveslots';
import type { Logger } from '@metamask/logger';
import type { MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KernelQueue } from '../KernelQueue.ts';
import { VatSyscall } from './VatSyscall.ts';
import type { KernelStore } from '../store/index.ts';

describe('VatSyscall', () => {
  let kernelQueue: KernelQueue;
  let kernelStore: KernelStore;
  let logger: Logger;
  let isActive: () => boolean;
  let vatSys: VatSyscall;

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
      getVatConfig: vi.fn(() => ({})),
    } as unknown as KernelStore;
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      subLogger: vi.fn(() => logger),
    } as unknown as Logger;
    isActive = vi.fn(() => true);
    vatSys = new VatSyscall({
      vatId: 'v1',
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
    vatSys.handleSyscall(vso);
    expect(kernelQueue.enqueueSend).toHaveBeenCalledWith(target, message);
  });

  it('calls resolvePromises for resolve syscall', () => {
    const resolution = ['kp1', false, {}] as unknown as VatOneResolution;
    const vso = ['resolve', [resolution]] as unknown as VatSyscallObject;
    vatSys.handleSyscall(vso);
    expect(kernelQueue.resolvePromises).toHaveBeenCalledWith('v1', [
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
      vatSys.handleSyscall(vso);
      expect(kernelStore.addPromiseSubscriber).toHaveBeenCalledWith(
        'v1',
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
      vatSys.handleSyscall(vso);
      expect(kernelQueue.enqueueNotify).toHaveBeenCalledWith('v1', 'kp1');
    });
  });

  describe('dropImports syscall', () => {
    it('clears reachable flags for valid imports', () => {
      const vso = [
        'dropImports',
        ['o-1', 'o-2'],
      ] as unknown as VatSyscallObject;
      vatSys.handleSyscall(vso);
      expect(kernelStore.clearReachableFlag).toHaveBeenCalledWith('v1', 'o-1');
      expect(kernelStore.clearReachableFlag).toHaveBeenCalledWith('v1', 'o-2');
    });

    it.each([
      ['o+1', 'vat v1 issued invalid syscall dropImports for o+1'],
      ['p-1', 'vat v1 issued invalid syscall dropImports for p-1'],
    ])('returns error for invalid ref %s', (ref, errMsg) => {
      (
        kernelStore.translateSyscallVtoK as unknown as MockInstance
      ).mockImplementationOnce(() => {
        throw new Error(errMsg);
      });
      const vso = ['dropImports', [ref]] as unknown as VatSyscallObject;
      const result = vatSys.handleSyscall(vso);
      expect(result).toStrictEqual(['error', errMsg]);
    });
  });

  describe('retireImports syscall', () => {
    it('forgets kref when not reachable', () => {
      (
        kernelStore.getReachableFlag as unknown as MockInstance
      ).mockReturnValueOnce(false);
      const vso = ['retireImports', ['o-1']] as unknown as VatSyscallObject;
      vatSys.handleSyscall(vso);
      expect(kernelStore.forgetKref).toHaveBeenCalledWith('v1', 'o-1');
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
      const result = vatSys.handleSyscall(vso);
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
      vatSys.handleSyscall(vso);
      expect(kernelStore.forgetKref).toHaveBeenCalledWith('v1', 'o+1');
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
      const result = vatSys.handleSyscall(vso);
      expect(result).toStrictEqual([
        'error',
        'syscall.retireExports but o+1 is still reachable',
      ]);
    });

    it('abandons exports without reachability check', () => {
      const vso = ['abandonExports', ['o+1']] as unknown as VatSyscallObject;
      vatSys.handleSyscall(vso);
      expect(kernelStore.forgetKref).toHaveBeenCalledWith('v1', 'o+1');
      expect(logger.debug).toHaveBeenCalledWith(
        'abandonExports: deleted object o+1',
      );
    });

    it('returns error for invalid abandonExports refs', () => {
      (
        kernelStore.translateSyscallVtoK as unknown as MockInstance
      ).mockImplementationOnce(() => {
        throw new Error('vat v1 issued invalid syscall abandonExports for o-1');
      });
      const vso = ['abandonExports', ['o-1']] as unknown as VatSyscallObject;
      const result = vatSys.handleSyscall(vso);
      expect(result).toStrictEqual([
        'error',
        'vat v1 issued invalid syscall abandonExports for o-1',
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
      vatSys.handleSyscall(vso);
      expect(vatSys.vatRequestedTermination).toStrictEqual({
        reject: true,
        info: { message: 'error' },
      });
    });
  });

  describe('error handling', () => {
    it('handles vat not found error', () => {
      vi.mocked(isActive).mockReturnValueOnce(false);
      const vso = ['send', 'o+1', {}] as unknown as VatSyscallObject;
      const result = vatSys.handleSyscall(vso);

      expect(result).toStrictEqual(['error', 'vat not found']);
      expect(vatSys.illegalSyscall).toBeDefined();
    });

    it('handles general syscall errors', () => {
      const error = new Error('test error');
      (
        kernelStore.translateSyscallVtoK as unknown as MockInstance
      ).mockImplementationOnce(() => {
        throw error;
      });

      const vso = ['send', 'o+1', {}] as unknown as VatSyscallObject;
      const result = vatSys.handleSyscall(vso);

      expect(result).toStrictEqual(['error', 'test error']);
      expect(logger.error).toHaveBeenCalledWith(
        'Fatal syscall error in vat v1',
        error,
      );
    });
  });

  describe('invalid or unknown syscalls', () => {
    it.each([
      ['vatstoreGet', 'invalid syscall vatstoreGet'],
      ['vatstoreGetNextKey', 'invalid syscall vatstoreGetNextKey'],
      ['vatstoreSet', 'invalid syscall vatstoreSet'],
      ['vatstoreDelete', 'invalid syscall vatstoreDelete'],
      ['callNow', 'invalid syscall callNow'],
      ['unknownOp', 'unknown syscall unknownOp'],
    ])('%s warns', (op, message) => {
      const spy = vi.spyOn(logger, 'warn');
      const vso = [op, []] as unknown as VatSyscallObject;
      vatSys.handleSyscall(vso);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining(message), vso);
      spy.mockRestore();
    });
  });

  describe('logging', () => {
    it('is disabled if logger is undefined', () => {
      const logSpy = vi.spyOn(console, 'log');
      const vatSyscall = new VatSyscall({
        vatId: 'v1',
        kernelQueue,
        kernelStore,
        isActive,
      });
      vatSyscall.handleSyscall(['send', 'o+1', {}] as VatSyscallObject);
      expect(logSpy).not.toHaveBeenCalled();
      expect(logger.log).not.toHaveBeenCalled();
    });
  });

  describe('vatLabel', () => {
    it('uses custom label in error messages', () => {
      const systemVatSyscall = new VatSyscall({
        vatId: 'sv0',
        kernelQueue,
        kernelStore,
        isActive: () => false,
        vatLabel: 'system vat',
        logger,
      });
      const vso = ['send', 'o+1', {}] as unknown as VatSyscallObject;
      const result = systemVatSyscall.handleSyscall(vso);

      expect(result).toStrictEqual(['error', 'system vat not found']);
    });
  });

  describe('getCrankResults', () => {
    it('returns basic result when no errors or termination', () => {
      const results = vatSys.getCrankResults(null);
      expect(results).toStrictEqual({
        didDelivery: 'v1',
      });
    });

    it('returns termination result for illegalSyscall', () => {
      vi.mocked(isActive).mockReturnValueOnce(false);
      vatSys.handleSyscall(['send', 'o+1', {}] as unknown as VatSyscallObject);

      const results = vatSys.getCrankResults(null);
      expect(results).toStrictEqual({
        didDelivery: 'v1',
        abort: true,
        terminate: {
          vatId: 'v1',
          reject: true,
          info: expect.objectContaining({
            body: expect.stringContaining('vat not found'),
          }),
        },
      });
    });

    it('returns termination result for deliveryError', () => {
      const results = vatSys.getCrankResults('delivery error');
      expect(results).toStrictEqual({
        didDelivery: 'v1',
        abort: true,
        terminate: {
          vatId: 'v1',
          reject: true,
          info: expect.objectContaining({
            body: expect.stringContaining('delivery error'),
          }),
        },
      });
    });

    it('returns termination result for vatRequestedTermination with reject=true', () => {
      vatSys.handleSyscall([
        'exit',
        true,
        { body: '"error message"', slots: [] },
      ] as unknown as VatSyscallObject);

      const results = vatSys.getCrankResults(null);
      expect(results).toStrictEqual({
        didDelivery: 'v1',
        abort: true,
        terminate: {
          vatId: 'v1',
          reject: true,
          info: { body: '"error message"', slots: [] },
        },
      });
    });

    it('returns termination result for vatRequestedTermination with reject=false', () => {
      vatSys.handleSyscall([
        'exit',
        false,
        { body: '"graceful exit"', slots: [] },
      ] as unknown as VatSyscallObject);

      const results = vatSys.getCrankResults(null);
      expect(results).toStrictEqual({
        didDelivery: 'v1',
        terminate: {
          vatId: 'v1',
          reject: false,
          info: { body: '"graceful exit"', slots: [] },
        },
      });
    });

    it('prioritizes illegalSyscall over deliveryError', () => {
      vi.mocked(isActive).mockReturnValueOnce(false);
      vatSys.handleSyscall(['send', 'o+1', {}] as unknown as VatSyscallObject);

      const results = vatSys.getCrankResults('delivery error');
      expect(results.terminate?.info.body).toContain('vat not found');
    });

    it('prioritizes illegalSyscall over vatRequestedTermination', () => {
      vi.mocked(isActive).mockReturnValueOnce(false);
      vatSys.handleSyscall(['send', 'o+1', {}] as unknown as VatSyscallObject);
      vatSys.vatRequestedTermination = {
        reject: false,
        info: { body: '"graceful"', slots: [] },
      };

      const results = vatSys.getCrankResults(null);
      expect(results.terminate?.info.body).toContain('vat not found');
    });

    it('prioritizes deliveryError over vatRequestedTermination', () => {
      vatSys.vatRequestedTermination = {
        reject: false,
        info: { body: '"graceful"', slots: [] },
      };

      const results = vatSys.getCrankResults('delivery error');
      expect(results.terminate?.info.body).toContain('delivery error');
    });
  });
});
