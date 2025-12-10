import type { Message } from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { getBaseMethods } from './base.ts';
import { getPromiseMethods } from './promise.ts';
import { getQueueMethods } from './queue.ts';
import { getRefCountMethods } from './refcount.ts';
import type { KRef, VatId } from '../../types.ts';
import type { StoreContext } from '../types.ts';
import * as promiseRefModule from '../utils/promise-ref.ts';

vi.mock('./base.ts', () => ({
  getBaseMethods: vi.fn(),
}));

vi.mock('./queue.ts', () => ({
  getQueueMethods: vi.fn(),
}));

vi.mock('./refcount.ts', () => ({
  getRefCountMethods: vi.fn(() => ({
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

// Mock the isPromiseRef function
vi.mock('../utils/promise-ref.ts', () => ({
  isPromiseRef: vi.fn((kref) => kref.startsWith('kp')),
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
  const mockDecrementRefCount = vi.fn();
  const mockIncrementRefCount = vi.fn();

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
    mockIncrementRefCount.mockClear();
    mockDecrementRefCount.mockClear();

    (getBaseMethods as ReturnType<typeof vi.fn>).mockReturnValue({
      refCountKey: mockRefCountKey,
      incCounter: mockIncCounter,
      provideStoredQueue: mockProvideStoredQueue,
      getPrefixedKeys: mockGetPrefixedKeys,
    });

    (getQueueMethods as ReturnType<typeof vi.fn>).mockReturnValue({
      enqueueRun: mockEnqueueRun,
    });

    (getRefCountMethods as ReturnType<typeof vi.fn>).mockReturnValue({
      decrementRefCount: mockDecrementRefCount,
      incrementRefCount: mockIncrementRefCount,
    });

    // Reset the isPromiseRef mock
    vi.mocked(promiseRefModule.isPromiseRef).mockImplementation(
      (kref) => typeof kref === 'string' && kref.startsWith('kp'),
    );

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

    it('does not include decider when it is an empty string', () => {
      const kpid = 'kp123';
      mockKV.set(`${kpid}.state`, 'unresolved');
      mockKV.set(`${kpid}.decider`, '');
      mockKV.set(`${kpid}.subscribers`, '["v1", "v2"]');

      const result = promiseMethods.getKernelPromise(kpid);

      expect(result).toStrictEqual({
        state: 'unresolved',
        subscribers: ['v1', 'v2'],
      });
      expect(result.decider).toBeUndefined();
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

    it('sets the decider when endpointId is kernel', () => {
      const kpid = 'kp123';

      promiseMethods.setPromiseDecider(kpid, 'kernel');

      expect(mockKV.get(`${kpid}.decider`)).toBe('kernel');
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
      const message = {
        methargs: { body: 'test', slots: [] },
        result: null as string | null,
      };
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

  describe('restorePromiseToUnresolved', () => {
    it('restores a rejected promise to unresolved with decider and subscribers', () => {
      const kpid = 'kp123';
      const decider = 'v1' as VatId;
      const subscribers: VatId[] = ['v2', 'v3'];

      mockKV.set(`${kpid}.state`, 'rejected');
      mockKV.set(`${kpid}.value`, '{"body":"error","slots":[]}');

      promiseMethods.restorePromiseToUnresolved(kpid, decider, subscribers);

      expect(mockKV.get(`${kpid}.state`)).toBe('unresolved');
      expect(mockKV.has(`${kpid}.value`)).toBe(false);
      expect(mockKV.get(`${kpid}.decider`)).toBe(decider);
      expect(mockKV.get(`${kpid}.subscribers`)).toBe(
        JSON.stringify(subscribers),
      );
      expect(mockIncrementRefCount).toHaveBeenCalledTimes(1);
      expect(mockIncrementRefCount).toHaveBeenCalledWith(
        kpid,
        'override|decider',
      );
    });

    it('restores a fulfilled promise to unresolved with decider and subscribers', () => {
      const kpid = 'kp123';
      const decider = 'v1' as VatId;
      const subscribers: VatId[] = ['v2'];

      mockKV.set(`${kpid}.state`, 'fulfilled');
      mockKV.set(`${kpid}.value`, '{"body":"value","slots":[]}');

      promiseMethods.restorePromiseToUnresolved(kpid, decider, subscribers);

      expect(mockKV.get(`${kpid}.state`)).toBe('unresolved');
      expect(mockKV.has(`${kpid}.value`)).toBe(false);
      expect(mockKV.get(`${kpid}.decider`)).toBe(decider);
      expect(mockKV.get(`${kpid}.subscribers`)).toBe(
        JSON.stringify(subscribers),
      );
      expect(mockIncrementRefCount).toHaveBeenCalledTimes(1);
      expect(mockIncrementRefCount).toHaveBeenCalledWith(
        kpid,
        'override|decider',
      );
    });

    it('restores a promise without decider', () => {
      const kpid = 'kp123';
      const subscribers: VatId[] = ['v1', 'v2'];

      mockKV.set(`${kpid}.state`, 'rejected');
      mockKV.set(`${kpid}.value`, '{"body":"error","slots":[]}');

      promiseMethods.restorePromiseToUnresolved(kpid, undefined, subscribers);

      expect(mockKV.get(`${kpid}.state`)).toBe('unresolved');
      expect(mockKV.has(`${kpid}.value`)).toBe(false);
      expect(mockKV.has(`${kpid}.decider`)).toBe(false);
      expect(mockKV.get(`${kpid}.subscribers`)).toBe(
        JSON.stringify(subscribers),
      );
      expect(mockIncrementRefCount).not.toHaveBeenCalled();
    });

    it('restores a promise with empty subscribers array', () => {
      const kpid = 'kp123';
      const decider = 'v1' as VatId;
      const subscribers: VatId[] = [];

      mockKV.set(`${kpid}.state`, 'rejected');
      mockKV.set(`${kpid}.value`, '{"body":"error","slots":[]}');

      promiseMethods.restorePromiseToUnresolved(kpid, decider, subscribers);

      expect(mockKV.get(`${kpid}.state`)).toBe('unresolved');
      expect(mockKV.has(`${kpid}.value`)).toBe(false);
      expect(mockKV.get(`${kpid}.decider`)).toBe(decider);
      expect(mockKV.get(`${kpid}.subscribers`)).toBe('[]');
      expect(mockIncrementRefCount).toHaveBeenCalledTimes(1);
    });

    it('restores a promise with kernel as decider', () => {
      const kpid = 'kp123';
      const subscribers: VatId[] = ['v1'];

      mockKV.set(`${kpid}.state`, 'rejected');
      mockKV.set(`${kpid}.value`, '{"body":"error","slots":[]}');

      promiseMethods.restorePromiseToUnresolved(kpid, 'kernel', subscribers);

      expect(mockKV.get(`${kpid}.state`)).toBe('unresolved');
      expect(mockKV.has(`${kpid}.value`)).toBe(false);
      expect(mockKV.get(`${kpid}.decider`)).toBe('kernel');
      expect(mockKV.get(`${kpid}.subscribers`)).toBe(
        JSON.stringify(subscribers),
      );
      expect(mockIncrementRefCount).toHaveBeenCalledTimes(1);
      expect(mockIncrementRefCount).toHaveBeenCalledWith(
        kpid,
        'override|decider',
      );
    });
  });

  describe('getKpidsToRetire', () => {
    it('returns the original promise kpid when there are no promises in the resolution value', () => {
      const origKpid = 'kp123';
      const origValue: CapData<KRef> = {
        body: 'someValue',
        slots: ['ko1', 'ko2'], // non-promise slots
      };

      const result = promiseMethods.getKpidsToRetire(origKpid, origValue);

      expect(result).toStrictEqual([origKpid]);
    });

    it('returns kpids of resolved promises found in the resolution value', () => {
      const origKpid = 'kp123';
      const resolvedPromise1 = 'kp456';
      const resolvedPromise2 = 'kp789';

      // Set up a resolution value with promise references
      const origValue: CapData<KRef> = {
        body: 'value with promises',
        slots: ['ko1', resolvedPromise1, resolvedPromise2],
      };

      // Set up the promises in the KV store
      mockKV.set(`${resolvedPromise1}.state`, 'fulfilled');
      mockKV.set(
        `${resolvedPromise1}.value`,
        JSON.stringify({
          body: 'fulfilled value 1',
          slots: [],
        }),
      );

      mockKV.set(`${resolvedPromise2}.state`, 'rejected');
      mockKV.set(
        `${resolvedPromise2}.value`,
        JSON.stringify({
          body: 'rejected value',
          slots: [],
        }),
      );

      const result = promiseMethods.getKpidsToRetire(origKpid, origValue);

      // Should include the original promise and the two resolved promises
      expect(result).toContain(origKpid);
      expect(result).toContain(resolvedPromise1);
      expect(result).toContain(resolvedPromise2);
      expect(result).toHaveLength(3);
    });

    it('handles promises with nested promise references', () => {
      const origKpid = 'kp100';
      const promise1 = 'kp101';
      const promise2 = 'kp102';
      const promise3 = 'kp103';

      // Original promise resolves to promise1
      const origValue: CapData<KRef> = {
        body: 'value with promise',
        slots: [promise1],
      };

      // promise1 resolves to promise2
      mockKV.set(`${promise1}.state`, 'fulfilled');
      mockKV.set(
        `${promise1}.value`,
        JSON.stringify({
          body: 'nested promise',
          slots: [promise2],
        }),
      );

      // promise2 resolves to promise3
      mockKV.set(`${promise2}.state`, 'fulfilled');
      mockKV.set(
        `${promise2}.value`,
        JSON.stringify({
          body: 'deeper nested promise',
          slots: [promise3],
        }),
      );

      // promise3 resolves to a simple value
      mockKV.set(`${promise3}.state`, 'fulfilled');
      mockKV.set(
        `${promise3}.value`,
        JSON.stringify({
          body: 'final value',
          slots: [],
        }),
      );

      const result = promiseMethods.getKpidsToRetire(origKpid, origValue);

      // Should include all promises in the chain
      expect(result).toContain(origKpid);
      expect(result).toContain(promise1);
      expect(result).toContain(promise2);
      expect(result).toContain(promise3);
      expect(result).toHaveLength(4);
    });

    it('handles cyclic promise references', () => {
      const origKpid = 'kp200';
      const promise1 = 'kp201';
      const promise2 = 'kp202';

      // Original promise resolves to promise1
      const origValue: CapData<KRef> = {
        body: 'cyclic promises',
        slots: [promise1],
      };

      // promise1 resolves to promise2
      mockKV.set(`${promise1}.state`, 'fulfilled');
      mockKV.set(
        `${promise1}.value`,
        JSON.stringify({
          body: 'points to promise2',
          slots: [promise2],
        }),
      );

      // promise2 resolves back to promise1 (creates a cycle)
      mockKV.set(`${promise2}.state`, 'fulfilled');
      mockKV.set(
        `${promise2}.value`,
        JSON.stringify({
          body: 'points back to promise1',
          slots: [promise1],
        }),
      );

      const result = promiseMethods.getKpidsToRetire(origKpid, origValue);

      // Should handle the cycle without infinite recursion
      expect(result).toContain(origKpid);
      expect(result).toContain(promise1);
      expect(result).toContain(promise2);
      expect(result).toHaveLength(3);
    });

    it('only includes resolved promises', () => {
      const origKpid = 'kp300';
      const resolvedPromise = 'kp301';
      const unresolvedPromise = 'kp302';

      // Original promise has both resolved and unresolved promises
      const origValue: CapData<KRef> = {
        body: 'mixed promises',
        slots: [resolvedPromise, unresolvedPromise],
      };

      // resolvedPromise is fulfilled
      mockKV.set(`${resolvedPromise}.state`, 'fulfilled');
      mockKV.set(
        `${resolvedPromise}.value`,
        JSON.stringify({
          body: 'resolved value',
          slots: [],
        }),
      );

      // unresolvedPromise is unresolved
      mockKV.set(`${unresolvedPromise}.state`, 'unresolved');
      mockKV.set(`${unresolvedPromise}.subscribers`, '[]');

      const result = promiseMethods.getKpidsToRetire(origKpid, origValue);

      // Should include original and resolved promise, but not unresolved one
      expect(result).toContain(origKpid);
      expect(result).toContain(resolvedPromise);
      expect(result).not.toContain(unresolvedPromise);
      expect(result).toHaveLength(2);
    });
  });
});
