import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { stringify } from '@ocap/utils';
import { describe, expect, it, vi } from 'vitest';

import type { ChromeRuntime } from './chrome.js';
import type { MessageEnvelope } from './ChromeRuntimeStream.js';
import {
  ChromeRuntimeReader,
  ChromeRuntimeWriter,
  ChromeRuntimeStreamTarget,
  ChromeRuntimeDuplexStream,
} from './ChromeRuntimeStream.js';
import { makeDoneResult, makePendingResult } from './utils.js';

// TODO: Something about the runtime mock prevents this test suite from being run
// concurrently. Even following the advice of using the test context `expect`
// doesn't help. Further investigation is needed to determine whether these tests
// can be run concurrently.

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

const makeEnvelope = (
  value: unknown,
  target: ChromeRuntimeStreamTarget,
): MessageEnvelope<unknown> => ({
  target,
  payload: value,
});

const EXTENSION_ID = 'test-extension-id';

// This function declares its own return type.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const makeRuntime = (extensionId: string = EXTENSION_ID) => {
  const listeners: ((...args: unknown[]) => void)[] = [];
  const dispatchRuntimeMessage = (
    message: unknown,
    target: ChromeRuntimeStreamTarget = ChromeRuntimeStreamTarget.Background,
    senderId: string = extensionId,
  ): void => {
    listeners.forEach((listener) =>
      listener(makeEnvelope(message, target), { id: senderId }),
    );
  };

  const runtime = {
    id: extensionId,
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
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      ChromeRuntimeStreamTarget.Background,
    );

    expect(reader).toBeInstanceOf(ChromeRuntimeReader);
    expect(reader[Symbol.asyncIterator]()).toBe(reader);
    expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
  });

  it('emits messages received from runtime', async () => {
    const { runtime, dispatchRuntimeMessage } = makeRuntime();
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      ChromeRuntimeStreamTarget.Background,
    );

    const message = makePendingResult({ foo: 'bar' });
    dispatchRuntimeMessage(message);

    expect(await reader.next()).toStrictEqual({
      ...message,
    });
  });

  it('ignores messages from other extensions', async () => {
    const { runtime, dispatchRuntimeMessage } = makeRuntime();
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      ChromeRuntimeStreamTarget.Background,
    );

    const nextP = reader.next();
    const message1 = makePendingResult({ foo: 'bar' });
    const message2 = makePendingResult({ fizz: 'buzz' });
    dispatchRuntimeMessage(message1, undefined, 'other-extension-id');
    dispatchRuntimeMessage(message2);

    expect(await nextP).toStrictEqual(message2);
  });

  it('ignores messages that are not valid envelopes', async () => {
    const { runtime, dispatchRuntimeMessage, listeners } = makeRuntime();
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      ChromeRuntimeStreamTarget.Background,
    );

    const nextP = reader.next();

    vi.spyOn(console, 'debug');
    listeners[0]?.({ not: 'an envelope' }, { id: EXTENSION_ID });

    expect(console.debug).toHaveBeenCalledWith(
      `ChromeRuntimeReader received unexpected message: ${stringify({
        not: 'an envelope',
      })}`,
    );

    const message = makePendingResult({ foo: 'bar' });
    dispatchRuntimeMessage(message);
    expect(await nextP).toStrictEqual({ ...message });
  });

  it('ignores messages for other targets', async () => {
    const { runtime, dispatchRuntimeMessage } = makeRuntime();
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      ChromeRuntimeStreamTarget.Background,
    );

    const nextP = reader.next();

    vi.spyOn(console, 'warn');
    const message1 = makePendingResult({ foo: 'bar' });
    // @ts-expect-error Intentional destructive testing
    dispatchRuntimeMessage(message1, 'foo');

    expect(console.warn).toHaveBeenCalledWith(
      `ChromeRuntimeReader received message for unexpected target: ${stringify({
        target: 'foo',
        payload: message1,
      })}`,
    );

    const message2 = makePendingResult({ fizz: 'buzz' });
    dispatchRuntimeMessage(message2);
    expect(await nextP).toStrictEqual({ ...message2 });
  });

  it('removes runtime.onMessage listener when done', async () => {
    const { runtime, dispatchRuntimeMessage, listeners } = makeRuntime();
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      ChromeRuntimeStreamTarget.Background,
    );
    expect(listeners).toHaveLength(1);

    dispatchRuntimeMessage(makeDoneResult());

    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(0);
  });

  it('calls onEnd once when ending', async () => {
    const { runtime, dispatchRuntimeMessage } = makeRuntime();
    const onEnd = vi.fn();
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      ChromeRuntimeStreamTarget.Background,
      onEnd,
    );

    dispatchRuntimeMessage(makeDoneResult());
    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('ChromeRuntimeWriter', () => {
  it('constructs a ChromeRuntimeWriter', () => {
    const { runtime } = makeRuntime();
    const writer = new ChromeRuntimeWriter(
      asChromeRuntime(runtime),
      ChromeRuntimeStreamTarget.Background,
    );

    expect(writer).toBeInstanceOf(ChromeRuntimeWriter);
    expect(writer[Symbol.asyncIterator]()).toBe(writer);
  });

  it('writes messages to runtime.sendMessage', async () => {
    const { runtime } = makeRuntime();
    const writer = new ChromeRuntimeWriter(
      asChromeRuntime(runtime),
      ChromeRuntimeStreamTarget.Background,
    );

    const message = { foo: 'bar' };
    const nextP = writer.next(message);

    expect(await nextP).toStrictEqual(makePendingResult(undefined));
    expect(runtime.sendMessage).toHaveBeenCalledWith(
      makeEnvelope(
        makePendingResult(message),
        ChromeRuntimeStreamTarget.Background,
      ),
    );
  });

  it('calls onEnd once when ending', async () => {
    const { runtime } = makeRuntime();
    const onEnd = vi.fn();
    const writer = new ChromeRuntimeWriter(
      asChromeRuntime(runtime),
      ChromeRuntimeStreamTarget.Background,
      onEnd,
    );

    expect(await writer.return()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(await writer.return()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('ChromeRuntimeDuplexStream', () => {
  it('constructs a ChromeRuntimeDuplexStream', () => {
    const { runtime } = makeRuntime();
    const duplexStream = new ChromeRuntimeDuplexStream(
      asChromeRuntime(runtime),
      ChromeRuntimeStreamTarget.Background,
      ChromeRuntimeStreamTarget.Background,
    );

    expect(duplexStream).toBeInstanceOf(ChromeRuntimeDuplexStream);
    expect(duplexStream[Symbol.asyncIterator]()).toBe(duplexStream);
  });

  it('ends the reader when the writer ends', async () => {
    const { runtime } = makeRuntime();
    const duplexStream = new ChromeRuntimeDuplexStream(
      asChromeRuntime(runtime),
      ChromeRuntimeStreamTarget.Background,
      ChromeRuntimeStreamTarget.Background,
    );
    runtime.sendMessage.mockImplementation(() => {
      throw new Error('foo');
    });

    await expect(duplexStream.write(42)).rejects.toThrow('foo');
    expect(await duplexStream.next()).toStrictEqual(makeDoneResult());
  });

  it('ends the writer when the reader ends', async () => {
    const { runtime, dispatchRuntimeMessage } = makeRuntime();
    const duplexStream = new ChromeRuntimeDuplexStream(
      asChromeRuntime(runtime),
      ChromeRuntimeStreamTarget.Background,
      ChromeRuntimeStreamTarget.Background,
    );

    dispatchRuntimeMessage(makeDoneResult());
    await delay(10);
    expect(await duplexStream.write(42)).toStrictEqual(makeDoneResult());
  });
});
