import { makePromiseKitMock } from '@ocap/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { ChromeRuntime } from './chrome.js';
import {
  makeChromeRuntimeStreamPair,
  ChromeRuntimeReader,
  ChromeRuntimeWriter,
} from './ChromeRuntimeStream.js';
import { makeDoneResult } from './shared.js';

// TODO: Something about the runtime mock prevents this test suite from being run
// concurrently. Even following the advice of using the test context `expect`
// doesn't help. Further investigation is needed to determine whether these tests
// can be run concurrently.

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

describe('ChromeRuntimeReader', () => {
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

    // TODO:errors chrome.runtime.sendMessage cannot serialize Error values.
    it('throws after receiving error from runtime, after read is enqueued', async () => {
      const { runtime, dispatchRuntimeMessage } = makeRuntime();
      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      const nextP = reader.next();
      const error = new Error('Test error');
      dispatchRuntimeMessage(error);

      await expect(nextP).rejects.toThrow('Test error');
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
      const reader = new ChromeRuntimeReader(asChromeRuntime(runtime));

      const nextP = reader.next();
      dispatchRuntimeMessage(makeDoneResult());

      expect(await nextP).toStrictEqual(makeDoneResult());
      expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
      expect(listeners).toHaveLength(0);

      // Ending is a terminal state.
      expect(await reader.next()).toStrictEqual(makeDoneResult());
      expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
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

describe('ChromeRuntimeWriter', () => {
  it('constructs a ChromeRuntimeWriter', () => {
    const { runtime } = makeRuntime();
    const writer = new ChromeRuntimeWriter(asChromeRuntime(runtime));

    expect(writer).toBeInstanceOf(ChromeRuntimeWriter);
    expect(writer[Symbol.asyncIterator]()).toBe(writer);
  });

  describe('next and sending messages', () => {
    it('sends messages using runtime.sendMessage', async () => {
      const { runtime } = makeRuntime();
      const writer = new ChromeRuntimeWriter(asChromeRuntime(runtime));

      const message = { foo: 'bar' };
      const nextP = writer.next(message);

      expect(await nextP).toStrictEqual({
        done: false,
        value: undefined,
      });
      expect(runtime.sendMessage).toHaveBeenCalledWith({
        done: false,
        value: message,
      });
    });

    it('throws if failing to send a message', async () => {
      const { runtime } = makeRuntime();
      const sendMessageSpy = vi
        .spyOn(runtime, 'sendMessage')
        .mockImplementationOnce(() => {
          throw new Error('foo');
        });
      const writer = new ChromeRuntimeWriter(asChromeRuntime(runtime));

      expect(await writer.next(null)).toStrictEqual(makeDoneResult());
      expect(sendMessageSpy).toHaveBeenCalledTimes(2);
      expect(sendMessageSpy).toHaveBeenNthCalledWith(1, {
        done: false,
        value: null,
      });
      expect(sendMessageSpy).toHaveBeenNthCalledWith(2, new Error('foo'));
    });

    it('failing to send a message logs the error', async () => {
      const { runtime } = makeRuntime();
      vi.spyOn(runtime, 'sendMessage').mockImplementationOnce(() => {
        throw new Error('foo');
      });
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const writer = new ChromeRuntimeWriter(asChromeRuntime(runtime));

      expect(await writer.next(null)).toStrictEqual(makeDoneResult());
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'ChromeRuntimeWriter experienced a dispatch failure:',
        new Error('foo'),
      );
    });

    it('handles repeated failures to send messages', async () => {
      const { runtime } = makeRuntime();
      const sendMessageSpy = vi
        .spyOn(runtime, 'sendMessage')
        .mockImplementationOnce(() => {
          throw new Error('foo');
        })
        .mockImplementationOnce(() => {
          throw new Error('foo');
        });
      const writer = new ChromeRuntimeWriter(asChromeRuntime(runtime));

      await expect(writer.next(null)).rejects.toThrow(
        'ChromeRuntimeWriter experienced repeated dispatch failures.',
      );
      expect(sendMessageSpy).toHaveBeenCalledTimes(3);
      expect(sendMessageSpy).toHaveBeenNthCalledWith(1, {
        done: false,
        value: null,
      });
      expect(sendMessageSpy).toHaveBeenNthCalledWith(2, new Error('foo'));
      expect(sendMessageSpy).toHaveBeenNthCalledWith(
        3,
        new Error(
          'ChromeRuntimeWriter experienced repeated dispatch failures.',
        ),
      );
    });
  });

  describe('return', () => {
    it('ends the stream', async () => {
      const { runtime } = makeRuntime();
      const writer = new ChromeRuntimeWriter(asChromeRuntime(runtime));

      expect(await writer.return()).toStrictEqual(makeDoneResult());
      expect(await writer.next(null)).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const { runtime } = makeRuntime();
      const writer = new ChromeRuntimeWriter(asChromeRuntime(runtime));

      expect(await writer.return()).toStrictEqual(makeDoneResult());
      expect(await writer.return()).toStrictEqual(makeDoneResult());
    });
  });

  describe('throw', () => {
    it('ends the stream', async () => {
      const { runtime } = makeRuntime();
      const writer = new ChromeRuntimeWriter(asChromeRuntime(runtime));

      expect(await writer.throw(new Error())).toStrictEqual(makeDoneResult());
      expect(await writer.next(null)).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const { runtime } = makeRuntime();
      const writer = new ChromeRuntimeWriter(asChromeRuntime(runtime));

      expect(await writer.throw(new Error())).toStrictEqual(makeDoneResult());
      expect(await writer.throw(new Error())).toStrictEqual(makeDoneResult());
    });
  });
});

describe('makeChromeRuntimeStreamPair', () => {
  it('returns a pair of chrome runtime streams', () => {
    const { runtime } = makeRuntime();
    const { reader, writer } = makeChromeRuntimeStreamPair(
      asChromeRuntime(runtime),
    );

    expect(reader).toBeInstanceOf(ChromeRuntimeReader);
    expect(writer).toBeInstanceOf(ChromeRuntimeWriter);
  });

  it('return() calls return() on both streams', async () => {
    const { runtime, listeners, dispatchRuntimeMessage } = makeRuntime();
    const streamPair = makeChromeRuntimeStreamPair(asChromeRuntime(runtime));
    const localReadP = streamPair.reader.next(undefined);

    expect(listeners).toHaveLength(1);

    await streamPair.return();

    expect(listeners).toHaveLength(0);

    dispatchRuntimeMessage(makeDoneResult());
    expect(await localReadP).toStrictEqual(makeDoneResult());
    expect(runtime.sendMessage).toHaveBeenCalledWith(makeDoneResult());
  });

  it('throw() calls throw() on the writer but return on the reader', async () => {
    const { runtime, listeners, dispatchRuntimeMessage } = makeRuntime();
    const streamPair = makeChromeRuntimeStreamPair(asChromeRuntime(runtime));
    const localReadP = streamPair.reader.next(undefined);

    expect(listeners).toHaveLength(1);

    const error = new Error('foo');
    await streamPair.throw(error);

    expect(listeners).toHaveLength(0);

    dispatchRuntimeMessage(makeDoneResult());
    expect(await localReadP).toStrictEqual(makeDoneResult());
    expect(runtime.sendMessage).toHaveBeenCalledWith(error);
  });
});
