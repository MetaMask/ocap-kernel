import type { KernelDatabase } from '@metamask/kernel-store';
import { expect, describe, it, vi, beforeEach } from 'vitest';

import { getCrankMethods } from './crank.ts';
import type { StoreContext } from '../types.ts';

describe('crank methods', () => {
  let context: StoreContext;
  let kdb: KernelDatabase;
  let crankMethods: ReturnType<typeof getCrankMethods>;

  beforeEach(() => {
    context = {
      inCrank: false,
      savepoints: [],
    } as unknown as StoreContext;

    kdb = {
      createSavepoint: vi.fn(),
      rollbackSavepoint: vi.fn(),
      releaseSavepoint: vi.fn(),
    } as unknown as KernelDatabase;

    crankMethods = getCrankMethods(context, kdb);
  });

  describe('startCrank', () => {
    it('should set inCrank to true and create a settlement promise', () => {
      crankMethods.startCrank();
      expect(context.inCrank).toBe(true);
      expect(typeof context.resolveCrank).toBe('function');
      expect(typeof (context.crankSettled as Promise<unknown>)?.then).toBe(
        'function',
      );
    });

    it('should throw when already in a crank', () => {
      context.inCrank = true;
      expect(() => crankMethods.startCrank()).toThrow(
        'startCrank while already in a crank',
      );
    });
  });

  describe('createCrankSavepoint', () => {
    it('should create a savepoint when in a crank', () => {
      context.inCrank = true;
      crankMethods.createCrankSavepoint('test');

      expect(context.savepoints).toStrictEqual(['test']);
      expect(kdb.createSavepoint).toHaveBeenCalledWith('t0');
    });

    it('should create multiple savepoints sequentially', () => {
      context.inCrank = true;
      crankMethods.createCrankSavepoint('first');
      crankMethods.createCrankSavepoint('second');

      expect(context.savepoints).toStrictEqual(['first', 'second']);
      expect(kdb.createSavepoint).toHaveBeenCalledWith('t0');
      expect(kdb.createSavepoint).toHaveBeenCalledWith('t1');
    });

    it('should throw when not in a crank', () => {
      expect(() => crankMethods.createCrankSavepoint('test')).toThrow(
        'createCrankSavepoint outside of crank',
      );
    });
  });

  describe('rollbackCrank', () => {
    it('should rollback to specified savepoint', () => {
      context.inCrank = true;
      context.savepoints = ['first', 'second', 'third'];

      crankMethods.rollbackCrank('second');

      expect(kdb.rollbackSavepoint).toHaveBeenCalledWith('t1');
      expect(context.savepoints).toStrictEqual(['first']);
    });

    it('should throw when savepoint does not exist', () => {
      context.inCrank = true;
      context.savepoints = ['first', 'second'];

      expect(() => crankMethods.rollbackCrank('nonexistent')).toThrow(
        'no such savepoint as ""nonexistent""',
      );
    });

    it('should throw when not in a crank', () => {
      expect(() => crankMethods.rollbackCrank('test')).toThrow(
        'rollbackCrank outside of crank',
      );
    });

    it('reuses ordinals after rollback', () => {
      context.inCrank = true;
      crankMethods.createCrankSavepoint('a');
      crankMethods.createCrankSavepoint('b');
      crankMethods.createCrankSavepoint('c');
      crankMethods.rollbackCrank('b');
      crankMethods.createCrankSavepoint('b2');
      expect(kdb.createSavepoint).toHaveBeenLastCalledWith('t1');
      expect(context.savepoints).toStrictEqual(['a', 'b2']);
    });
  });

  describe('endCrank', () => {
    it('should set inCrank to false and resolve the settlement promise', async () => {
      crankMethods.startCrank();
      const resolveSpy = vi.fn();
      context.resolveCrank = resolveSpy as unknown as () => void;
      crankMethods.endCrank();
      expect(resolveSpy).toHaveBeenCalledTimes(1);
      expect(context.inCrank).toBe(false);
      expect(context.resolveCrank).toBeUndefined();
    });

    it('should release savepoints if they exist', () => {
      context.inCrank = true;
      context.savepoints = ['test'];
      crankMethods.endCrank();
      expect(kdb.releaseSavepoint).toHaveBeenCalledWith('t0');
      expect(context.savepoints).toStrictEqual([]);
    });

    it('should not call releaseSavepoint if no savepoints exist', () => {
      context.inCrank = true;
      crankMethods.endCrank();
      expect(kdb.releaseSavepoint).not.toHaveBeenCalled();
    });

    it('should throw when not in a crank', () => {
      expect(() => crankMethods.endCrank()).toThrow(
        'endCrank outside of crank',
      );
    });

    it('throws on double endCrank', () => {
      context.inCrank = true;
      crankMethods.endCrank();
      expect(() => crankMethods.endCrank()).toThrow(
        'endCrank outside of crank',
      );
    });
  });

  describe('releaseAllSavepoints', () => {
    it('should release all savepoints', () => {
      context.inCrank = true;
      context.savepoints = ['test'];
      crankMethods.releaseAllSavepoints();
      expect(kdb.releaseSavepoint).toHaveBeenCalledWith('t0');
      expect(context.savepoints).toStrictEqual([]);
    });

    it('should not call releaseSavepoint if no savepoints exist', () => {
      context.inCrank = true;
      crankMethods.releaseAllSavepoints();
      expect(kdb.releaseSavepoint).not.toHaveBeenCalled();
    });
  });

  describe('waitForCrank', () => {
    it('should resolve immediately when not in a crank', async () => {
      context.inCrank = false;
      expect(await crankMethods.waitForCrank()).toBeUndefined();
    });

    it('should wait until crank is finished', async () => {
      crankMethods.startCrank();
      const waiter = crankMethods.waitForCrank();
      let done = false;
      waiter.then(() => (done = true)).catch(console.error);
      await Promise.resolve();
      expect(done).toBe(false);
      crankMethods.endCrank();
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(done).toBe(true);
      await waiter;
    });

    it('should handle multiple wait calls', async () => {
      crankMethods.startCrank();
      const p1 = crankMethods.waitForCrank();
      const p2 = crankMethods.waitForCrank();
      const p3 = crankMethods.waitForCrank();
      crankMethods.endCrank();
      expect(await Promise.all([p1, p2, p3])).toBeDefined();
      expect(context.inCrank).toBe(false);
    });

    it('creates a fresh settlement promise for each crank', async () => {
      crankMethods.startCrank();
      const first = crankMethods.waitForCrank();
      crankMethods.endCrank();
      await first;
      crankMethods.startCrank();
      const second = crankMethods.waitForCrank();
      expect(second).not.toBe(first);
      crankMethods.endCrank();
    });
  });
});
