import type {
  Message,
  VatOneResolution,
  VatSyscallObject,
} from '@agoric/swingset-liveslots';
import type { Logger } from '@metamask/logger';
import type { MockInstance } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { KernelQueue } from './KernelQueue.ts';
import type { KernelStore } from './store/index.ts';
import { VatSyscall } from './VatSyscall.ts';

describe('VatSyscall', () => {
  let kernelQueue: KernelQueue;
  let kernelStore: KernelStore;
  let logger: Logger;
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
      markVatAsCompromised: vi.fn(),
    } as unknown as KernelStore;
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;
    vatSys = new VatSyscall({ vatId: 'v1', kernelQueue, kernelStore, logger });
  });

  it('enqueues run for send syscall', async () => {
    const target = 'o+1';
    const message = {} as unknown as Message;
    const vso = ['send', target, message] as unknown as VatSyscallObject;
    await vatSys.handleSyscall(vso);
    expect(kernelQueue.enqueueSend).toHaveBeenCalledWith(target, message);
  });

  it('calls resolvePromises for resolve syscall', async () => {
    const resolution = ['kp1', false, {}] as unknown as VatOneResolution;
    const vso = ['resolve', [resolution]] as unknown as VatSyscallObject;
    await vatSys.handleSyscall(vso);
    expect(kernelQueue.resolvePromises).toHaveBeenCalledWith('v1', [
      resolution,
    ]);
  });

  describe('subscribe syscall', () => {
    it('subscribes to unresolved promise', async () => {
      (
        kernelStore.getKernelPromise as unknown as MockInstance
      ).mockReturnValueOnce({
        state: 'unresolved',
      });
      const vso = ['subscribe', 'kp1'] as unknown as VatSyscallObject;
      await vatSys.handleSyscall(vso);
      expect(kernelStore.addPromiseSubscriber).toHaveBeenCalledWith(
        'v1',
        'kp1',
      );
    });

    it('notifies for resolved promise', async () => {
      (
        kernelStore.getKernelPromise as unknown as MockInstance
      ).mockReturnValueOnce({
        state: 'fulfilled',
      });
      const vso = ['subscribe', 'kp1'] as unknown as VatSyscallObject;
      await vatSys.handleSyscall(vso);
      expect(kernelQueue.enqueueNotify).toHaveBeenCalledWith('v1', 'kp1');
    });
  });

  describe('dropImports syscall', () => {
    it('clears reachable flags for valid imports', async () => {
      const vso = [
        'dropImports',
        ['o-1', 'o-2'],
      ] as unknown as VatSyscallObject;
      await vatSys.handleSyscall(vso);
      expect(kernelStore.clearReachableFlag).toHaveBeenCalledWith('v1', 'o-1');
      expect(kernelStore.clearReachableFlag).toHaveBeenCalledWith('v1', 'o-2');
    });

    it.each([
      ['o+1', 'vat v1 issued invalid syscall dropImports for o+1'],
      ['p-1', 'vat v1 issued invalid syscall dropImports for p-1'],
    ])('returns error for invalid ref %s', async (ref, errMsg) => {
      (
        kernelStore.translateSyscallVtoK as unknown as MockInstance
      ).mockImplementationOnce(() => {
        throw new Error(errMsg);
      });
      const vso = ['dropImports', [ref]] as unknown as VatSyscallObject;
      const result = await vatSys.handleSyscall(vso);
      expect(result).toStrictEqual(['error', errMsg]);
    });
  });

  describe('retireImports syscall', () => {
    it('forgets kref when not reachable', async () => {
      (
        kernelStore.getReachableFlag as unknown as MockInstance
      ).mockReturnValueOnce(false);
      const vso = ['retireImports', ['o-1']] as unknown as VatSyscallObject;
      await vatSys.handleSyscall(vso);
      expect(kernelStore.forgetKref).toHaveBeenCalledWith('v1', 'o-1');
    });

    it('returns error if still reachable', async () => {
      (
        kernelStore.translateSyscallVtoK as unknown as MockInstance
      ).mockImplementationOnce(() => {
        (
          kernelStore.getReachableFlag as unknown as MockInstance
        ).mockReturnValueOnce(true);
        throw new Error('syscall.retireImports but o-1 is still reachable');
      });
      const vso = ['retireImports', ['o-1']] as unknown as VatSyscallObject;
      const result = await vatSys.handleSyscall(vso);
      expect(result).toStrictEqual([
        'error',
        'syscall.retireImports but o-1 is still reachable',
      ]);
    });
  });

  describe('exportCleanup syscalls', () => {
    it('retires exports when not reachable', async () => {
      (
        kernelStore.getReachableFlag as unknown as MockInstance
      ).mockReturnValueOnce(false);
      const vso = ['retireExports', ['o+1']] as unknown as VatSyscallObject;
      await vatSys.handleSyscall(vso);
      expect(kernelStore.forgetKref).toHaveBeenCalledWith('v1', 'o+1');
      expect(logger.debug).toHaveBeenCalledWith(
        'retireExports: deleted object o+1',
      );
    });

    it('returns error for reachable exports', async () => {
      (
        kernelStore.translateSyscallVtoK as unknown as MockInstance
      ).mockImplementationOnce(() => {
        (
          kernelStore.getReachableFlag as unknown as MockInstance
        ).mockReturnValueOnce(true);
        throw new Error('syscall.retireExports but o+1 is still reachable');
      });
      const vso = ['retireExports', ['o+1']] as unknown as VatSyscallObject;
      const result = await vatSys.handleSyscall(vso);
      expect(result).toStrictEqual([
        'error',
        'syscall.retireExports but o+1 is still reachable',
      ]);
    });

    it('abandons exports without reachability check', async () => {
      const vso = ['abandonExports', ['o+1']] as unknown as VatSyscallObject;
      await vatSys.handleSyscall(vso);
      expect(kernelStore.forgetKref).toHaveBeenCalledWith('v1', 'o+1');
      expect(logger.debug).toHaveBeenCalledWith(
        'abandonExports: deleted object o+1',
      );
    });

    it('returns error for invalid abandonExports refs', async () => {
      (
        kernelStore.translateSyscallVtoK as unknown as MockInstance
      ).mockImplementationOnce(() => {
        throw new Error('vat v1 issued invalid syscall abandonExports for o-1');
      });
      const vso = ['abandonExports', ['o-1']] as unknown as VatSyscallObject;
      const result = await vatSys.handleSyscall(vso);
      expect(result).toStrictEqual([
        'error',
        'vat v1 issued invalid syscall abandonExports for o-1',
      ]);
    });
  });

  describe('exit syscall', () => {
    it('records vat termination request', async () => {
      const vso = [
        'exit',
        true,
        { message: 'error' },
      ] as unknown as VatSyscallObject;
      await vatSys.handleSyscall(vso);
      expect(vatSys.vatRequestedTermination).toStrictEqual({
        reject: true,
        info: { message: 'error' },
      });
    });
  });

  describe('error handling', () => {
    it('handles vat not found error', async () => {
      (kernelStore.getVatConfig as unknown as MockInstance).mockReturnValueOnce(
        undefined,
      );
      const vso = ['send', 'o+1', {}] as unknown as VatSyscallObject;
      const result = await vatSys.handleSyscall(vso);

      expect(result).toStrictEqual(['error', 'vat not found']);
      expect(vatSys.illegalSyscall).toBeDefined();
      expect(kernelStore.markVatAsCompromised).toHaveBeenCalledWith('v1');
      expect(logger.error).toHaveBeenCalledWith(
        'Vat v1 marked as compromised due to fatal syscall error: vat not found',
      );
    });

    it('handles general syscall errors', async () => {
      const error = new Error('test error');
      (
        kernelStore.translateSyscallVtoK as unknown as MockInstance
      ).mockImplementationOnce(() => {
        throw error;
      });

      const vso = ['send', 'o+1', {}] as unknown as VatSyscallObject;
      const result = await vatSys.handleSyscall(vso);

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
    ])('%s should warn', async (op, message) => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
        // do nothing
      });
      const vso = [op, []] as unknown as VatSyscallObject;
      await vatSys.handleSyscall(vso);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining(message), vso);
      spy.mockRestore();
    });
  });
});
