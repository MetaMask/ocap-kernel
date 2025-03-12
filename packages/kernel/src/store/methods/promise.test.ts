import type { Message } from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import type { KVStore } from '@ocap/store';
import { describe, it, expect, beforeEach } from 'vitest';

import { getPromiseMethods } from './promise.ts';
import { makeMapKVStore } from '../../../test/storage.ts';
import type { KRef } from '../../types.ts';
import type { StoreContext } from '../types.ts';

/**
 * Mock Message: A helper to allow simple objects to be used as Messages for testing
 *
 * @param obj - An object to use as a message.
 * @returns The same object coerced to type Message.
 */
function mockMessage(obj: object): Message {
  return obj as unknown as Message;
}

describe('promise-methods', () => {
  let kv: KVStore;
  let promiseStore: ReturnType<typeof getPromiseMethods>;
  let nextPromiseId: { get: () => string; set: (value: string) => void };

  beforeEach(() => {
    kv = makeMapKVStore();
    // Initialize nextPromiseId counter
    kv.set('nextPromiseId', '0');
    nextPromiseId = {
      get: () => kv.get('nextPromiseId') ?? '0',
      set: (value: string) => kv.set('nextPromiseId', value),
    };

    promiseStore = getPromiseMethods({
      kv,
      nextPromiseId,
    } as StoreContext);
  });

  describe('initKernelPromise', () => {
    it('creates a new unresolved kernel promise', () => {
      const [kpid, kp] = promiseStore.initKernelPromise();

      // Check the returned promise
      expect(kpid).toBe('kp0');
      expect(kp).toStrictEqual({
        state: 'unresolved',
        subscribers: [],
      });

      // Check the stored promise
      expect(kv.get(`${kpid}.state`)).toBe('unresolved');
      expect(kv.get(`${kpid}.subscribers`)).toBe('[]');
      expect(kv.get(`${kpid}.refCount`)).toBe('1');
    });

    it('increments the promise ID counter', () => {
      const [kpid1] = promiseStore.initKernelPromise();
      const [kpid2] = promiseStore.initKernelPromise();
      const [kpid3] = promiseStore.initKernelPromise();

      expect(kpid1).toBe('kp0');
      expect(kpid2).toBe('kp1');
      expect(kpid3).toBe('kp2');
    });
  });

  describe('getKernelPromise', () => {
    it('retrieves an unresolved promise', () => {
      const [kpid] = promiseStore.initKernelPromise();
      const kp = promiseStore.getKernelPromise(kpid);

      expect(kp).toStrictEqual({
        state: 'unresolved',
        subscribers: [],
      });
    });

    it('retrieves an unresolved promise with decider', () => {
      const [kpid] = promiseStore.initKernelPromise();
      promiseStore.setPromiseDecider(kpid, 'v1');

      const kp = promiseStore.getKernelPromise(kpid);
      expect(kp).toStrictEqual({
        state: 'unresolved',
        decider: 'v1',
        subscribers: [],
      });
    });

    it('retrieves a fulfilled promise', () => {
      const [kpid] = promiseStore.initKernelPromise();
      const value: CapData<KRef> = { body: 'fulfilled-value', slots: [] };

      promiseStore.resolveKernelPromise(kpid, false, value);

      const kp = promiseStore.getKernelPromise(kpid);
      expect(kp).toStrictEqual({
        state: 'fulfilled',
        value,
      });
    });

    it('retrieves a rejected promise', () => {
      const [kpid] = promiseStore.initKernelPromise();
      const value: CapData<KRef> = { body: 'error-message', slots: [] };

      promiseStore.resolveKernelPromise(kpid, true, value);

      const kp = promiseStore.getKernelPromise(kpid);
      expect(kp).toStrictEqual({
        state: 'rejected',
        value,
      });
    });

    it('throws for unknown promises', () => {
      expect(() => promiseStore.getKernelPromise('kp99')).toThrow(
        'unknown kernel promise kp99',
      );
    });
  });

  describe('deleteKernelPromise', () => {
    it('removes a promise from storage', () => {
      const [kpid] = promiseStore.initKernelPromise();

      // Add a message to the promise queue
      promiseStore.enqueuePromiseMessage(
        kpid,
        mockMessage({ test: 'message' }),
      );

      // Delete the promise
      promiseStore.deleteKernelPromise(kpid);

      // Check that all promise data is gone
      expect(kv.get(`${kpid}.state`)).toBeUndefined();
      expect(kv.get(`${kpid}.subscribers`)).toBeUndefined();
      expect(kv.get(`${kpid}.refCount`)).toBeUndefined();

      // Check that the promise queue is gone
      expect(() =>
        promiseStore.enqueuePromiseMessage(kpid, mockMessage({})),
      ).toThrow(`queue ${kpid} not initialized`);
    });
  });

  describe('getNextPromiseId', () => {
    it('returns sequential promise IDs', () => {
      expect(promiseStore.getNextPromiseId()).toBe('kp0');
      expect(promiseStore.getNextPromiseId()).toBe('kp1');
      expect(promiseStore.getNextPromiseId()).toBe('kp2');
    });
  });

  describe('addPromiseSubscriber', () => {
    it('adds a subscriber to an unresolved promise', () => {
      const [kpid] = promiseStore.initKernelPromise();

      promiseStore.addPromiseSubscriber('v1', kpid);

      const kp = promiseStore.getKernelPromise(kpid);
      expect(kp.subscribers).toStrictEqual(['v1']);

      // Add another subscriber
      promiseStore.addPromiseSubscriber('v2', kpid);

      const kpUpdated = promiseStore.getKernelPromise(kpid);
      expect(kpUpdated.subscribers).toStrictEqual(['v1', 'v2']);
    });

    it('does not add duplicate subscribers', () => {
      const [kpid] = promiseStore.initKernelPromise();

      promiseStore.addPromiseSubscriber('v1', kpid);
      promiseStore.addPromiseSubscriber('v1', kpid);

      const kp = promiseStore.getKernelPromise(kpid);
      expect(kp.subscribers).toStrictEqual(['v1']);
    });

    it('throws when adding a subscriber to a resolved promise', () => {
      const [kpid] = promiseStore.initKernelPromise();

      // Resolve the promise
      promiseStore.resolveKernelPromise(kpid, false, {
        body: 'value',
        slots: [],
      });

      // Try to add a subscriber
      expect(() => promiseStore.addPromiseSubscriber('v1', kpid)).toThrow(
        /attempt to add subscriber to resolved promise/u,
      );
    });
  });

  describe('setPromiseDecider', () => {
    it('sets the decider for a promise', () => {
      const [kpid] = promiseStore.initKernelPromise();

      promiseStore.setPromiseDecider(kpid, 'v3');

      const kp = promiseStore.getKernelPromise(kpid);
      expect(kp.decider).toBe('v3');
    });

    it('updates the decider for a promise', () => {
      const [kpid] = promiseStore.initKernelPromise();

      promiseStore.setPromiseDecider(kpid, 'v1');
      promiseStore.setPromiseDecider(kpid, 'v2');

      const kp = promiseStore.getKernelPromise(kpid);
      expect(kp.decider).toBe('v2');
    });
  });

  describe('resolveKernelPromise', () => {
    it('fulfills a promise', () => {
      const [kpid] = promiseStore.initKernelPromise();
      const value: CapData<KRef> = { body: 'fulfilled-value', slots: ['ko1'] };

      promiseStore.resolveKernelPromise(kpid, false, value);

      const kp = promiseStore.getKernelPromise(kpid);
      expect(kp.state).toBe('fulfilled');
      expect(kp.value).toStrictEqual(value);
    });

    it('rejects a promise', () => {
      const [kpid] = promiseStore.initKernelPromise();
      const value: CapData<KRef> = { body: 'error-message', slots: [] };

      promiseStore.resolveKernelPromise(kpid, true, value);

      const kp = promiseStore.getKernelPromise(kpid);
      expect(kp.state).toBe('rejected');
      expect(kp.value).toStrictEqual(value);
    });

    it('clears decider and subscribers when resolving', () => {
      const [kpid] = promiseStore.initKernelPromise();

      // Add decider and subscribers
      promiseStore.setPromiseDecider(kpid, 'v1');
      promiseStore.addPromiseSubscriber('v2', kpid);

      // Resolve the promise
      promiseStore.resolveKernelPromise(kpid, false, {
        body: 'value',
        slots: [],
      });

      // Check that decider and subscribers are gone
      expect(kv.get(`${kpid}.decider`)).toBeUndefined();
      expect(kv.get(`${kpid}.subscribers`)).toBeUndefined();
    });

    it('preserves queued messages when resolving', () => {
      const [kpid] = promiseStore.initKernelPromise();

      // Add messages to the queue
      const message1 = mockMessage({ id: 1 });
      const message2 = mockMessage({ id: 2 });

      promiseStore.enqueuePromiseMessage(kpid, message1);
      promiseStore.enqueuePromiseMessage(kpid, message2);

      // Resolve the promise
      promiseStore.resolveKernelPromise(kpid, false, {
        body: 'value',
        slots: [],
      });

      // Check that messages are still in the queue
      const messages = promiseStore.getKernelPromiseMessageQueue(kpid);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toStrictEqual(message1);
      expect(messages[1]).toStrictEqual(message2);
    });
  });

  describe('enqueuePromiseMessage and getKernelPromiseMessageQueue', () => {
    it('enqueues and retrieves messages', () => {
      const [kpid] = promiseStore.initKernelPromise();

      const message1 = mockMessage({ id: 1, data: 'first' });
      const message2 = mockMessage({ id: 2, data: 'second' });

      promiseStore.enqueuePromiseMessage(kpid, message1);
      promiseStore.enqueuePromiseMessage(kpid, message2);

      const messages = promiseStore.getKernelPromiseMessageQueue(kpid);

      expect(messages).toHaveLength(2);
      expect(messages[0]).toStrictEqual(message1);
      expect(messages[1]).toStrictEqual(message2);
    });

    it('empties the queue when retrieving messages', () => {
      const [kpid] = promiseStore.initKernelPromise();

      promiseStore.enqueuePromiseMessage(kpid, mockMessage({ id: 1 }));
      promiseStore.enqueuePromiseMessage(kpid, mockMessage({ id: 2 }));

      // First call gets all messages
      const messages1 = promiseStore.getKernelPromiseMessageQueue(kpid);
      expect(messages1).toHaveLength(2);

      // Second call gets empty array
      const messages2 = promiseStore.getKernelPromiseMessageQueue(kpid);
      expect(messages2).toHaveLength(0);
    });

    it('throws when enqueueing to a non-existent promise', () => {
      expect(() =>
        promiseStore.enqueuePromiseMessage('kp99', mockMessage({})),
      ).toThrow('queue kp99 not initialized');
    });
  });

  describe('integration', () => {
    it('supports the full promise lifecycle', () => {
      // Create a promise
      const [kpid] = promiseStore.initKernelPromise();

      // Add subscribers and decider
      promiseStore.addPromiseSubscriber('v1', kpid);
      promiseStore.addPromiseSubscriber('v2', kpid);
      promiseStore.setPromiseDecider(kpid, 'v3');

      // Add messages
      promiseStore.enqueuePromiseMessage(kpid, mockMessage({ id: 1 }));

      // Check the promise state
      let kp = promiseStore.getKernelPromise(kpid);
      expect(kp.state).toBe('unresolved');
      expect(kp.subscribers).toStrictEqual(['v1', 'v2']);
      expect(kp.decider).toBe('v3');

      // Resolve the promise
      const value: CapData<KRef> = { body: 'final-value', slots: ['ko5'] };
      promiseStore.resolveKernelPromise(kpid, false, value);

      // Check the resolved state
      kp = promiseStore.getKernelPromise(kpid);
      expect(kp.state).toBe('fulfilled');
      expect(kp.value).toStrictEqual(value);

      // Messages should still be available
      const messages = promiseStore.getKernelPromiseMessageQueue(kpid);
      expect(messages).toHaveLength(1);

      // Delete the promise
      promiseStore.deleteKernelPromise(kpid);

      // Promise should be gone
      expect(() => promiseStore.getKernelPromise(kpid)).toThrow(
        `unknown kernel promise ${kpid}`,
      );
    });

    it('handles multiple promises simultaneously', () => {
      // Create two promises
      const [kpid1] = promiseStore.initKernelPromise();
      const [kpid2] = promiseStore.initKernelPromise();

      // Set up different states
      promiseStore.addPromiseSubscriber('v1', kpid1);
      promiseStore.setPromiseDecider(kpid2, 'v2');

      // Add messages to both
      promiseStore.enqueuePromiseMessage(kpid1, mockMessage({ for: 'kp1' }));
      promiseStore.enqueuePromiseMessage(kpid2, mockMessage({ for: 'kp2' }));

      // Resolve one promise
      promiseStore.resolveKernelPromise(kpid1, false, {
        body: 'resolved',
        slots: [],
      });

      // Check states
      const kp1 = promiseStore.getKernelPromise(kpid1);
      const kp2 = promiseStore.getKernelPromise(kpid2);

      expect(kp1.state).toBe('fulfilled');
      expect(kp2.state).toBe('unresolved');

      // Messages should be preserved
      const messages1 = promiseStore.getKernelPromiseMessageQueue(kpid1);
      const messages2 = promiseStore.getKernelPromiseMessageQueue(kpid2);

      expect(messages1).toHaveLength(1);
      expect(messages2).toHaveLength(1);
    });
  });
});
