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
    it('should set inCrank to true', () => {
      crankMethods.startCrank();
      expect(context.inCrank).toBe(true);
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
  });

  describe('endCrank', () => {
    it('should set inCrank to false', () => {
      context.inCrank = true;
      crankMethods.endCrank();

      expect(context.inCrank).toBe(false);
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
});
