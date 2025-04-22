import type { Message } from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { getBaseMethods } from './base.ts';
import { getPromiseMethods } from './promise.ts';
import { getQueueMethods } from './queue.ts';
import { getRefCountMethods } from './refcount.ts';
import type { KRef, VatId } from '../../types.ts';
import type { StoreContext } from '../types.ts';
import { getCListMethods } from './clist.ts';

vi.mock('./base.ts', () => ({
  getBaseMethods: vi.fn(),
}));

vi.mock('./queue.ts', () => ({
  getQueueMethods: vi.fn(),
}));

vi.mock('./refcount.ts', () => ({
  getRefCountMethods: vi.fn(),
}));

vi.mock('./clist.ts', () => ({
  getCListMethods: vi.fn(() => ({
    incrementRefCount: vi.fn(),
    decrementRefCount: vi.fn(),
  })),
}));

vi.mock('../utils/kernel-slots.ts', () => ({
  makeKernelSlot: vi.fn((type, id) =>
    type === 'promise' ? `kp${id}` : `ko${id}`,
  ),
}));

vi.mock('../utils/parse-ref.ts', () => ({
  parseRef: vi.fn((kref) => {
    if (kref.startsWith('kp')) {
      return { context: 'kernel', isPromise: true };
    }
    return { context: 'vat', isPromise: false };
  }),
}));

describe('promise store methods', () => {
  let mockKV: Map<string, string>;
  let mockEnqueueRun = vi.fn();
  let mockIncCounter = vi.fn();
  let mockProvideStoredQueue = vi.fn();
  let mockGetPrefixedKeys = vi.fn();
  let mockRefCountKey = vi.fn((id) => `refcount.${id}`);
  let mockQueue = {
    enqueue: vi.fn(),
    dequeue: vi.fn(),
    delete: vi.fn(),
  };
  let context: StoreContext;
  let promiseMethods: ReturnType<typeof getPromiseMethods>;
  const mockIncrementRefCount = vi.fn();
  const mockDecrementRefCount = vi.fn();

  beforeEach(() => {
    mockKV = new Map();
    mockEnqueueRun = vi.fn();
    mockIncCounter = vi.fn();
    mockGetPrefixedKeys = vi.fn();
    mockRefCountKey = vi.fn((id) => `refcount.${id}`);
    mockQueue = {
      enqueue: vi.fn(),
      dequeue: vi.fn(),
      delete: vi.fn(),
    };
    mockProvideStoredQueue = vi.fn(() => mockQueue);

    (getBaseMethods as ReturnType<typeof vi.fn>).mockReturnValue({
      incCounter: mockIncCounter,
      provideStoredQueue: mockProvideStoredQueue,
      getPrefixedKeys: mockGetPrefixedKeys,
    });

    (getQueueMethods as ReturnType<typeof vi.fn>).mockReturnValue({
      enqueueRun: mockEnqueueRun,
    });

    (getRefCountMethods as ReturnType<typeof vi.fn>).mockReturnValue({
      refCountKey: mockRefCountKey,
    });

    (getCListMethods as ReturnType<typeof vi.fn>).mockReturnValue({
      incrementRefCount: mockIncrementRefCount,
      decrementRefCount: mockDecrementRefCount,
    });

    context = {
      kv: {
        get: (key: string): string | undefined => mockKV.get(key),
        getRequired: (key: string): string => {
          const value = mockKV.get(key);
          if (value === undefined) {
            throw new Error(`Required key ${key} not found`);
          }
          return value;
        },
        set: (key: string, value: string): void => {
          mockKV.set(key, value);
        },
        delete: (key: string): void => {
          mockKV.delete(key);
        },
      },
      nextPromiseId: 'nextPromiseId',
    } as unknown as StoreContext;

    promiseMethods = getPromiseMethods(context);
  });

  describe('initKernelPromise', () => {
    it('creates a new unresolved kernel promise with reference count 1', () => {
      mockIncCounter.mockReturnValue('42');

      const [kpid, kpr] = promiseMethods.initKernelPromise();

      expect(kpid).toBe('kp42');
      expect(kpr).toStrictEqual({
        state: 'unresolved',
        subscribers: [],
      });

      expect(mockIncCounter).toHaveBeenCalledWith('nextPromiseId');
      expect(mockProvideStoredQueue).toHaveBeenCalledWith('kp42', false);
      expect(mockKV.get('kp42.state')).toBe('unresolved');
      expect(mockKV.get('kp42.subscribers')).toBe('[]');
      expect(mockKV.get('refcount.kp42')).toBe('1');
    });
  });

  describe('getKernelPromise', () => {
    it('retrieves an unresolved promise without decider', () => {
      const kpid = 'kp123';
      mockKV.set(`${kpid}.state`, 'unresolved');
      mockKV.set(`${kpid}.subscribers`, '["v1", "v2"]');

      const result = promiseMethods.getKernelPromise(kpid);

      expect(result).toStrictEqual({
        state: 'unresolved',
        subscribers: ['v1', 'v2'],
      });
    });

    it('retrieves an unresolved promise with decider', () => {
      const kpid = 'kp123';
      mockKV.set(`${kpid}.state`, 'unresolved');
      mockKV.set(`${kpid}.decider`, 'v3');
      mockKV.set(`${kpid}.subscribers`, '["v1", "v2"]');

      const result = promiseMethods.getKernelPromise(kpid);

      expect(result).toStrictEqual({
        state: 'unresolved',
        decider: 'v3',
        subscribers: ['v1', 'v2'],
      });
    });

    it('retrieves a fulfilled promise', () => {
      const kpid = 'kp123';
      mockKV.set(`${kpid}.state`, 'fulfilled');
      mockKV.set(`${kpid}.value`, '{"body":"someValue","slots":[]}');

      const result = promiseMethods.getKernelPromise(kpid);

      expect(result).toStrictEqual({
        state: 'fulfilled',
        value: { body: 'someValue', slots: [] },
      });
    });

    it('retrieves a rejected promise', () => {
      const kpid = 'kp123';
      mockKV.set(`${kpid}.state`, 'rejected');
      mockKV.set(`${kpid}.value`, '{"body":"error","slots":[]}');

      const result = promiseMethods.getKernelPromise(kpid);

      expect(result).toStrictEqual({
        state: 'rejected',
        value: { body: 'error', slots: [] },
      });
    });

    it('throws for unknown promise', () => {
      const kpid = 'kp999';

      expect(() => promiseMethods.getKernelPromise(kpid)).toThrow(
        `unknown kernel promise ${kpid}`,
      );
    });

    it('throws for unknown promise state', () => {
      const kpid = 'kp123';
      mockKV.set(`${kpid}.state`, 'invalid-state');

      expect(() => promiseMethods.getKernelPromise(kpid)).toThrow(
        `unknown state for ${kpid}: invalid-state`,
      );
    });
  });

  describe('deleteKernelPromise', () => {
    it('removes all data associated with a kernel promise', () => {
      const kpid = 'kp123';
      mockKV.set(`${kpid}.state`, 'unresolved');
      mockKV.set(`${kpid}.decider`, 'v1');
      mockKV.set(`${kpid}.subscribers`, '["v2", "v3"]');
      mockKV.set(`${kpid}.value`, '{"body":"someValue","slots":[]}');
      mockKV.set(`refcount.${kpid}`, '2');

      promiseMethods.deleteKernelPromise(kpid);

      expect(mockKV.has(`${kpid}.state`)).toBe(false);
      expect(mockKV.has(`${kpid}.decider`)).toBe(false);
      expect(mockKV.has(`${kpid}.subscribers`)).toBe(false);
      expect(mockKV.has(`${kpid}.value`)).toBe(false);
      expect(mockKV.has(`refcount.${kpid}`)).toBe(false);
      expect(mockProvideStoredQueue).toHaveBeenCalledWith(kpid);
      expect(mockQueue.delete).toHaveBeenCalled();
    });
  });

  describe('getNextPromiseId', () => {
    it('increments the counter and returns a new promise ID', () => {
      mockIncCounter.mockReturnValue('456');

      const result = promiseMethods.getNextPromiseId();

      expect(result).toBe('kp456');
      expect(mockIncCounter).toHaveBeenCalledWith('nextPromiseId');
    });
  });

  describe('addPromiseSubscriber', () => {
    it('adds a new subscriber to an unresolved promise', () => {
      const kpid = 'kp123';
      const vatId = 'v2' as VatId;
      mockKV.set(`${kpid}.state`, 'unresolved');
      mockKV.set(`${kpid}.subscribers`, '["v1"]');

      promiseMethods.addPromiseSubscriber(vatId, kpid);

      expect(mockKV.get(`${kpid}.subscribers`)).toBe('["v1","v2"]');
    });

    it('does not add duplicate subscribers', () => {
      const kpid = 'kp123';
      const vatId = 'v1' as VatId;
      mockKV.set(`${kpid}.state`, 'unresolved');
      mockKV.set(`${kpid}.subscribers`, '["v1"]');

      promiseMethods.addPromiseSubscriber(vatId, kpid);

      expect(mockKV.get(`${kpid}.subscribers`)).toBe('["v1"]');
    });

    it('throws if promise is already resolved', () => {
      const kpid = 'kp123';
      const vatId = 'v2' as VatId;
      mockKV.set(`${kpid}.state`, 'fulfilled');
      mockKV.set(`${kpid}.value`, '{"body":"someValue","slots":[]}');

      expect(() => promiseMethods.addPromiseSubscriber(vatId, kpid)).toThrow(
        `attempt to add subscriber to resolved promise "${kpid}"`,
      );
    });
  });

  describe('setPromiseDecider', () => {
    it('sets the decider for a kernel promise', () => {
      const kpid = 'kp123';
      const vatId = 'v1' as VatId;

      promiseMethods.setPromiseDecider(kpid, vatId);

      expect(mockKV.get(`${kpid}.decider`)).toBe(vatId);
    });

    it('does nothing when kpid is falsy', () => {
      const kpid = '' as KRef;
      const vatId = 'v1' as VatId;

      promiseMethods.setPromiseDecider(kpid, vatId);

      expect(mockKV.get(`${kpid}.decider`)).toBeUndefined();
    });
  });

  describe('resolveKernelPromise', () => {
    it('fulfills a promise and enqueues pending messages', () => {
      const kpid = 'kp123';
      const value: CapData<KRef> = {
        body: 'someValue',
        slots: ['o+1', 'o+2'],
      };
      const message1: Message = { method: 'method1' } as unknown as Message;
      const message2: Message = { method: 'method2' } as unknown as Message;

      mockKV.set(`${kpid}.state`, 'unresolved');
      mockKV.set(`${kpid}.decider`, 'v1');
      mockKV.set(`${kpid}.subscribers`, '["v2", "v3"]');

      mockQueue.dequeue
        .mockReturnValueOnce(message1)
        .mockReturnValueOnce(message2)
        .mockReturnValueOnce(undefined);

      promiseMethods.resolveKernelPromise(kpid, false, value);

      expect(mockQueue.dequeue).toHaveBeenCalledTimes(3);
      expect(mockEnqueueRun).toHaveBeenCalledTimes(2);
      expect(mockEnqueueRun).toHaveBeenNthCalledWith(1, {
        type: 'send',
        target: kpid,
        message: message1,
      });
      expect(mockEnqueueRun).toHaveBeenNthCalledWith(2, {
        type: 'send',
        target: kpid,
        message: message2,
      });

      expect(mockKV.get(`${kpid}.state`)).toBe('fulfilled');
      expect(mockKV.get(`${kpid}.value`)).toBe(JSON.stringify(value));
      expect(mockKV.has(`${kpid}.decider`)).toBe(false);
      expect(mockKV.has(`${kpid}.subscribers`)).toBe(false);
      expect(mockQueue.delete).toHaveBeenCalled();
      expect(mockIncrementRefCount).toHaveBeenCalledTimes(2);
      expect(mockDecrementRefCount).toHaveBeenCalledTimes(1);
    });

    it('rejects a promise and enqueues pending messages', () => {
      const kpid = 'kp123';
      const value: CapData<KRef> = { body: 'error', slots: [] };

      mockKV.set(`${kpid}.state`, 'unresolved');
      mockKV.set(`${kpid}.decider`, 'v1');
      mockKV.set(`${kpid}.subscribers`, '["v2", "v3"]');

      mockQueue.dequeue.mockReturnValue(undefined);

      promiseMethods.resolveKernelPromise(kpid, true, value);

      expect(mockKV.get(`${kpid}.state`)).toBe('rejected');
      expect(mockKV.get(`${kpid}.value`)).toBe(JSON.stringify(value));
      expect(mockKV.has(`${kpid}.decider`)).toBe(false);
      expect(mockKV.has(`${kpid}.subscribers`)).toBe(false);
      expect(mockQueue.delete).toHaveBeenCalled();
    });
  });

  describe('enqueuePromiseMessage', () => {
    it('adds a message to the promise queue', () => {
      const kpid = 'kp123';
      const message: Message = { method: 'someMethod' } as unknown as Message;

      promiseMethods.enqueuePromiseMessage(kpid, message);

      expect(mockProvideStoredQueue).toHaveBeenCalledWith(kpid, false);
      expect(mockQueue.enqueue).toHaveBeenCalledWith(message);
    });
  });

  describe('getKernelPromiseMessageQueue', () => {
    it('retrieves all messages from the promise queue', () => {
      const kpid = 'kp123';
      const message1: Message = { method: 'method1' } as unknown as Message;
      const message2: Message = { method: 'method2' } as unknown as Message;

      mockQueue.dequeue
        .mockReturnValueOnce(message1)
        .mockReturnValueOnce(message2)
        .mockReturnValueOnce(undefined);

      const result = promiseMethods.getKernelPromiseMessageQueue(kpid);

      expect(result).toStrictEqual([message1, message2]);
      expect(mockProvideStoredQueue).toHaveBeenCalledWith(kpid, false);
      expect(mockQueue.dequeue).toHaveBeenCalledTimes(3);
    });

    it('returns an empty array for an empty queue', () => {
      const kpid = 'kp123';

      mockQueue.dequeue.mockReturnValue(undefined);

      const result = promiseMethods.getKernelPromiseMessageQueue(kpid);

      expect(result).toStrictEqual([]);
      expect(mockProvideStoredQueue).toHaveBeenCalledWith(kpid, false);
      expect(mockQueue.dequeue).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPromisesByDecider', () => {
    it('yields promises decided by a specific vat', () => {
      const vatId = 'v1' as VatId;
      const kpid1 = 'kp101';
      const kpid2 = 'kp102';
      const kpid3 = 'kp103';

      // Set up mock data
      mockGetPrefixedKeys.mockReturnValue([
        `cle.${vatId}.p1`,
        `cle.${vatId}.p2`,
        `cle.${vatId}.p3`,
      ]);

      mockKV.set(`cle.${vatId}.p1`, kpid1);
      mockKV.set(`cle.${vatId}.p2`, kpid2);
      mockKV.set(`cle.${vatId}.p3`, kpid3);

      // kpid1 is decided by vatId
      mockKV.set(`${kpid1}.state`, 'unresolved');
      mockKV.set(`${kpid1}.decider`, vatId);
      mockKV.set(`${kpid1}.subscribers`, '[]');

      // kpid2 is also decided by vatId
      mockKV.set(`${kpid2}.state`, 'unresolved');
      mockKV.set(`${kpid2}.decider`, vatId);
      mockKV.set(`${kpid2}.subscribers`, '[]');

      // kpid3 is unresolved but decided by a different vat
      mockKV.set(`${kpid3}.state`, 'unresolved');
      mockKV.set(`${kpid3}.decider`, 'v2');
      mockKV.set(`${kpid3}.subscribers`, '[]');

      const result = Array.from(promiseMethods.getPromisesByDecider(vatId));

      expect(result).toStrictEqual([kpid1, kpid2]);
      expect(mockGetPrefixedKeys).toHaveBeenCalledWith(`cle.${vatId}.p`);
    });

    it('does not yield resolved promises', () => {
      const vatId = 'v1' as VatId;
      const kpid1 = 'kp101';
      const kpid2 = 'kp102';

      mockGetPrefixedKeys.mockReturnValue([
        `cle.${vatId}.p1`,
        `cle.${vatId}.p2`,
      ]);

      mockKV.set(`cle.${vatId}.p1`, kpid1);
      mockKV.set(`cle.${vatId}.p2`, kpid2);

      // kpid1 is fulfilled
      mockKV.set(`${kpid1}.state`, 'fulfilled');
      mockKV.set(`${kpid1}.value`, '{"body":"value","slots":[]}');

      // kpid2 is unresolved and decided by vatId
      mockKV.set(`${kpid2}.state`, 'unresolved');
      mockKV.set(`${kpid2}.decider`, vatId);
      mockKV.set(`${kpid2}.subscribers`, '[]');

      const result = Array.from(promiseMethods.getPromisesByDecider(vatId));

      expect(result).toStrictEqual([kpid2]);
    });

    it('yields nothing if no promises are decided by the vat', () => {
      const vatId = 'v1' as VatId;

      mockGetPrefixedKeys.mockReturnValue([]);

      const result = Array.from(promiseMethods.getPromisesByDecider(vatId));

      expect(result).toStrictEqual([]);
    });
  });
});
