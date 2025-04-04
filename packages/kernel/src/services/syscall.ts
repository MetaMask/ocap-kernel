import {
  insistVatSyscallObject,
  insistVatSyscallResult,
} from '@agoric/swingset-liveslots';
import type {
  VatSyscallObject,
  VatOneResolution,
} from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import type { KVStore } from '@ocap/store';
import type { Logger } from '@ocap/utils';
import { makeLogger } from '@ocap/utils';

import type { Syscall, SyscallResult } from './types.ts';
import type { VatSupervisor } from '../VatSupervisor.ts';

/**
 * This returns a function that is provided to liveslots as the 'syscall'
 * argument: an object with one method per syscall type. These methods return
 * data, or nothing. If the kernel experiences a problem executing the syscall,
 * the method will throw, or the kernel will kill the vat, or both.
 *
 * I should be given a `syscallToManager` function that accepts a
 * VatSyscallObject and (synchronously) returns a VatSyscallResult.
 *
 * @param supervisor - The VatSupervisor for which we're providing syscall services.
 * @param kv - A key/value store for holding the vat's persistent state.
 * @param logger - The logger to use for error and diagnostic output.
 *
 * @returns a syscall object suitable for use by liveslots.
 */
function makeSupervisorSyscall(
  supervisor: VatSupervisor,
  kv: KVStore,
  logger?: Logger,
): Syscall {
  /**
   * Actually perform the syscall operation.
   *
   * @param vso - A descriptor for the syscall to be performed.
   * @returns the result from performing the syscall.
   */
  function doSyscall(vso: VatSyscallObject): SyscallResult {
    const sysLogger = logger ?? makeLogger(`[syscall ${supervisor.id}]`);
    insistVatSyscallObject(vso);
    let syscallResult;
    try {
      syscallResult = supervisor.executeSyscall(vso);
    } catch (problem) {
      sysLogger.warn(`supervisor got error during syscall:`, problem);
      throw problem;
    }
    const vsr = syscallResult;
    insistVatSyscallResult(vsr);
    const [type, ...rest] = vsr;
    switch (type) {
      case 'ok': {
        const [data] = rest;
        return data;
      }
      case 'error': {
        const [problem] = rest;
        throw Error(`syscall.${vso[0]} failed: ${problem as string}`);
      }
      default:
        throw Error(`unknown result type ${type as string}`);
    }
  }

  // this will be given to liveslots, it should have distinct methods that
  // return immediate results or throw errors
  const syscallForVat: Syscall = {
    send: (target: string, methargs: CapData<string>, result?: string) =>
      doSyscall(['send', target, { methargs, result }]),
    subscribe: (vpid: string) => doSyscall(['subscribe', vpid]),
    resolve: (resolutions: VatOneResolution[]) =>
      doSyscall(['resolve', resolutions]),
    exit: (isFailure: boolean, info: CapData<string>) =>
      doSyscall(['exit', isFailure, info]),
    dropImports: (vrefs: string[]) => doSyscall(['dropImports', vrefs]),
    retireImports: (vrefs: string[]) => doSyscall(['retireImports', vrefs]),
    retireExports: (vrefs: string[]) => doSyscall(['retireExports', vrefs]),
    abandonExports: (vrefs: string[]) => doSyscall(['abandonExports', vrefs]),
    callNow: (_target: string, _method: string, _args: unknown[]) => {
      throw Error(`callNow not supported (we have no devices)`);
    },

    vatstoreGet: (key: string) => kv.get(key),
    vatstoreGetNextKey: (priorKey: string) => kv.getNextKey(priorKey),
    vatstoreSet: (key: string, value: string) => kv.set(key, value),
    vatstoreDelete: (key: string) => kv.delete(key),
  };

  return harden(syscallForVat);
}

harden(makeSupervisorSyscall);
export { makeSupervisorSyscall };
