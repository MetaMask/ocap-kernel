import { makePromiseKitMock } from '@ocap/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { ChromeRuntime } from './chrome.js';
import {
  makeChromeRuntimeStreamPair,
  ChromeRuntimeReader,
  ChromeRuntimeWriter,
} from './ChromeRuntimeStream.js';
import { makeDoneResult } from './shared.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

// This function declares its own return type.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const makeRuntime = () => {
  const listeners: ((...args: unknown[]) => void)[] = [];
  const dispatchRuntimeMessage = (message: unknown): void => {
    listeners.forEach((listener) => listener(message));
  };

  const runtime = {
    onMessage: {
      addListener: vi.fn((listener) => {
        listeners.push(listener);
      }),
      removeListener: vi.fn((listener) => {
        listeners.splice(listeners.indexOf(listener), 1);
      }),
    },
    sendMessage: vi.fn(),
  };

  return { runtime, listeners, dispatchRuntimeMessage };
};

const asChromeRuntime = (
  runtime: ReturnType<typeof makeRuntime>['runtime'],
): ChromeRuntime => runtime as unknown as ChromeRuntime;

describe.concurrent('ChromeRuntimeReader', () => {
  it('constructs a ChromeRuntimeReader', () => {
    const { runtime } = makeRuntime();
    const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

    expect(reader).toBeInstanceOf(ChromeRuntimeReader);
    expect(reader[Symbol.asyncIterator]()).toBe(reader);
    expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
  });

  describe('next and iteration', () => {
    it('emits runtime message received before next()', async () => {
      const { runtime, dispatchRuntimeMessage } = makeRuntime();
      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      const message = { done: false, value: { foo: 'bar' } };
      dispatchRuntimeMessage(message);

      expect(await reader.next()).toStrictEqual({
        ...message,
      });
    });

    it('emits runtime message received after next()', async () => {
      const { runtime, dispatchRuntimeMessage } = makeRuntime();
      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      const nextP = reader.next();
      const message = { done: false, value: { foo: 'bar' } };
      dispatchRuntimeMessage(message);

      expect(await nextP).toStrictEqual({
        ...message,
      });
    });

    it('iterates over multiple runtime messages', async () => {
      const { runtime, dispatchRuntimeMessage } = makeRuntime();
      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      const messages = [{ foo: 'bar' }, { bar: 'baz' }, { baz: 'qux' }];
      messages.forEach((value) =>
        dispatchRuntimeMessage({ done: false, value }),
      );

      let index = 0;
      for await (const message of reader) {
        expect(message).toStrictEqual(messages[index]);

        index += 1;
        if (index === messages.length) {
          break;
        }
      }
    });

    it.fails(
      'throws after receiving unexpected message from runtime, before read is enqueued',
      async () => {
        const { runtime, dispatchRuntimeMessage } = makeRuntime();
        const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

        const unexpectedMessage = { foo: 'bar' };
        dispatchRuntimeMessage(unexpectedMessage);

        await expect(reader.next()).rejects.toThrow(
          'Received unexpected message from transport',
        );
      },
    );

    it('throws after receiving unexpected message from runtime, after read is enqueued', async () => {
      const { runtime, dispatchRuntimeMessage } = makeRuntime();
      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      const nextP = reader.next();
      const unexpectedMessage = { foo: 'bar' };
      dispatchRuntimeMessage(unexpectedMessage);

      await expect(nextP).rejects.toThrow(
        'Received unexpected message from transport',
      );
    });

    it('ends after receiving final iterator result from runtime, before read is enqueued', async () => {
      const { runtime, dispatchRuntimeMessage, listeners } = makeRuntime();
      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      dispatchRuntimeMessage(makeDoneResult());

      expect(await reader.next()).toStrictEqual(makeDoneResult());
      expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
      expect(listeners).toHaveLength(0);

      // Ending is a terminal state.
      expect(await reader.next()).toStrictEqual(makeDoneResult());
      expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
      expect(listeners).toHaveLength(0);
    });

    it('ends after receiving final iterator result from runtime, after read is enqueued', async () => {
      const { runtime, dispatchRuntimeMessage, listeners } = makeRuntime();

      // TODO:vitest-bug
      // This test case hits some kind of bug in vitest where the runtime.onMessage.removeListener
      // spy and its implementation are called, but the spy's call count is not incremented. We
      // set up our own call counter to verify the spy is called until this is fixed upstream.
      let removeListenerCallCount = 0;
      const originalRemoveListener =
        runtime.onMessage.removeListener.getMockImplementation() as (
          ...args: unknown[]
        ) => void;
      vi.spyOn(runtime.onMessage, 'removeListener').mockImplementation(
        (...args) => {
          removeListenerCallCount += 1;
          originalRemoveListener(...args);
        },
      );

      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      const nextP = reader.next();
      // dispatchRuntimeMessage(makeDoneResult());
      debugger; // TODO:vitest-bug
      dispatchRuntimeMessage({ done: true, value: 'DEBUG' });

      expect(await nextP).toStrictEqual(makeDoneResult());
      // TODO:vitest-bug This succeeds
      expect(removeListenerCallCount).toBe(1);
      // TODO:vitest-bug This fails with: expected "spy" to be called 1 times, but got 0 times
      // expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
      expect(listeners).toHaveLength(0);

      // Ending is a terminal state.
      expect(await reader.next()).toStrictEqual(makeDoneResult());
      expect(removeListenerCallCount).toBe(1);
      // expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
      expect(listeners).toHaveLength(0);
    });
  });

  describe('return', () => {
    it('ends the stream', async () => {
      const { runtime } = makeRuntime();
      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      expect(await reader.return()).toStrictEqual(makeDoneResult());
      expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const { runtime } = makeRuntime();
      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      expect(await reader.return()).toStrictEqual(makeDoneResult());
      expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
      expect(await reader.return()).toStrictEqual(makeDoneResult());
      expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
    });

    it('resolves pending read promises', async () => {
      const { runtime } = makeRuntime();
      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      const nextP1 = reader.next();
      const nextP2 = reader.next();
      const returnP = reader.return();

      expect(await nextP1).toStrictEqual(makeDoneResult());
      expect(await nextP2).toStrictEqual(makeDoneResult());
      expect(await returnP).toStrictEqual(makeDoneResult());
    });
  });

  describe('throw', () => {
    it('ends the stream', async () => {
      const { runtime } = makeRuntime();
      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      expect(await reader.throw(new Error())).toStrictEqual(makeDoneResult());
      expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const { runtime } = makeRuntime();
      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      expect(await reader.throw(new Error())).toStrictEqual(makeDoneResult());
      expect(await reader.throw(new Error())).toStrictEqual(makeDoneResult());
      expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
    });

    it('rejects pending read promises', async () => {
      const { runtime } = makeRuntime();
      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      const nextP1 = reader.next();
      const nextP2 = reader.next();
      const throwP = reader.throw(new Error('foo'));

      await expect(nextP1).rejects.toThrow(new Error('foo'));
      await expect(nextP2).rejects.toThrow(new Error('foo'));
      expect(await throwP).toStrictEqual(makeDoneResult());
    });
  });
});
