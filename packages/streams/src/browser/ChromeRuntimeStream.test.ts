import { delay, stringify } from '@ocap/utils';
import { describe, expect, it, vi } from 'vitest';

import type { ChromeRuntime } from './chrome.d.ts';
import type {
  MessageEnvelope,
  ChromeRuntimeTarget,
} from './ChromeRuntimeStream.ts';
import {
  ChromeRuntimeReader,
  ChromeRuntimeWriter,
  ChromeRuntimeDuplexStream,
} from './ChromeRuntimeStream.ts';
import { makeAck } from '../BaseDuplexStream.ts';
import type { ValidateInput } from '../BaseStream.ts';
import {
  makeDoneResult,
  makePendingResult,
  makeStreamDoneSignal,
} from '../utils.ts';

const makeEnvelope = (
  value: unknown,
  target: ChromeRuntimeTarget,
  source: ChromeRuntimeTarget,
): MessageEnvelope<unknown> => ({
  target,
  source,
  payload: value,
});

const EXTENSION_ID = 'test-extension-id';

const mocks = vi.hoisted(() => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@ocap/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ocap/utils')>();
  return {
    ...actual,
    makeLogger: vi.fn(() => mocks.logger),
  };
});

// This function declares its own return type.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const makeRuntime = (extensionId: string = EXTENSION_ID) => {
  const listeners: ((...args: unknown[]) => void)[] = [];
  const dispatchRuntimeMessage = (
    message: unknown,
    target: ChromeRuntimeTarget = 'background',
    source: ChromeRuntimeTarget = 'offscreen',
    senderId: string = extensionId,
  ): void => {
    listeners.forEach((listener) =>
      listener(makeEnvelope(message, target, source), { id: senderId }),
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

// TODO: Further investigation is needed to determine whether these tests
// can be run concurrently.
describe('ChromeRuntimeReader', () => {
  it('constructs a ChromeRuntimeReader', () => {
    const { runtime } = makeRuntime();
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
    );

    expect(reader).toBeInstanceOf(ChromeRuntimeReader);
    expect(reader[Symbol.asyncIterator]()).toBe(reader);
    expect(runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
  });

  it('emits messages received from runtime', async () => {
    const { runtime, dispatchRuntimeMessage } = makeRuntime();
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
    );

    const message = { foo: 'bar' };
    dispatchRuntimeMessage(message);

    expect(await reader.next()).toStrictEqual(makePendingResult(message));
  });

  it('calls validateInput with received input if specified', async () => {
    const { runtime, dispatchRuntimeMessage } = makeRuntime();
    const validateInput = vi
      .fn()
      .mockReturnValue(true) as unknown as ValidateInput<number>;
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
      { validateInput },
    );

    const message = { foo: 'bar' };
    dispatchRuntimeMessage(message);

    expect(await reader.next()).toStrictEqual(makePendingResult(message));
    expect(validateInput).toHaveBeenCalledWith(message);
  });

  it('throws if validateInput throws', async () => {
    const { runtime, dispatchRuntimeMessage } = makeRuntime();
    const validateInput = (() => {
      throw new Error('foo');
    }) as unknown as ValidateInput<number>;
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
      { validateInput },
    );

    const message = { foo: 'bar' };
    dispatchRuntimeMessage(message);
    await expect(reader.next()).rejects.toThrow('foo');
    expect(await reader.next()).toStrictEqual(makeDoneResult());
  });

  it('ignores messages from other extensions', async () => {
    const { runtime, dispatchRuntimeMessage } = makeRuntime();
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
    );

    const nextP = reader.next();
    const message1 = { foo: 'bar' };
    const message2 = { fizz: 'buzz' };
    dispatchRuntimeMessage(
      message1,
      'background',
      'offscreen',
      'other-extension-id',
    );
    dispatchRuntimeMessage(message2);

    expect(await nextP).toStrictEqual(makePendingResult(message2));
  });

  it('ignores messages that are not valid envelopes', async () => {
    const { runtime, dispatchRuntimeMessage, listeners } = makeRuntime();
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
    );

    const nextP = reader.next();

    const debugSpy = vi.spyOn(mocks.logger, 'debug');
    listeners[0]?.({ not: 'an envelope' }, { id: EXTENSION_ID });

    expect(debugSpy).toHaveBeenCalledWith(
      `received unexpected message: ${stringify({
        not: 'an envelope',
      })}`,
    );

    const message = { foo: 'bar' };
    dispatchRuntimeMessage(message);
    expect(await nextP).toStrictEqual(makePendingResult(message));
  });

  it('ignores messages for other targets', async () => {
    const { runtime, dispatchRuntimeMessage } = makeRuntime();
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
    );

    const nextP = reader.next();

    vi.spyOn(mocks.logger, 'warn');
    const message1 = { foo: 'bar' };
    dispatchRuntimeMessage(
      message1,
      // @ts-expect-error Intentional destructive testing
      'foo',
      'offscreen',
    );

    const message2 = { fizz: 'buzz' };
    dispatchRuntimeMessage(message2);
    expect(await nextP).toStrictEqual(makePendingResult(message2));
  });

  it('removes runtime.onMessage listener when done', async () => {
    const { runtime, dispatchRuntimeMessage, listeners } = makeRuntime();
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
    );
    expect(listeners).toHaveLength(1);

    dispatchRuntimeMessage(makeStreamDoneSignal());

    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(0);
  });

  it('calls onEnd once when ending', async () => {
    const { runtime, dispatchRuntimeMessage } = makeRuntime();
    const onEnd = vi.fn();
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
      { onEnd },
    );

    dispatchRuntimeMessage(makeStreamDoneSignal());
    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('handles errors from onEnd function', async () => {
    const { runtime, dispatchRuntimeMessage } = makeRuntime();
    const onEnd = vi.fn(() => {
      throw new Error('foo');
    });
    const reader = new ChromeRuntimeReader(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
      { onEnd },
    );

    dispatchRuntimeMessage(makeStreamDoneSignal());
    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe.concurrent('ChromeRuntimeWriter', () => {
  it('constructs a ChromeRuntimeWriter', () => {
    const { runtime } = makeRuntime();
    const writer = new ChromeRuntimeWriter(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
    );

    expect(writer).toBeInstanceOf(ChromeRuntimeWriter);
    expect(writer[Symbol.asyncIterator]()).toBe(writer);
  });

  it('writes messages to runtime.sendMessage', async () => {
    const { runtime } = makeRuntime();
    const writer = new ChromeRuntimeWriter(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
    );

    const message = { foo: 'bar' };
    const nextP = writer.next(message);

    expect(await nextP).toStrictEqual(makePendingResult(undefined));
    expect(runtime.sendMessage).toHaveBeenCalledWith(
      makeEnvelope(message, 'background', 'offscreen'),
    );
  });

  it('calls onEnd once when ending', async () => {
    const { runtime } = makeRuntime();
    const onEnd = vi.fn();
    const writer = new ChromeRuntimeWriter(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
      { onEnd },
    );

    expect(await writer.return()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(await writer.return()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe.concurrent('ChromeRuntimeDuplexStream', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const makeDuplexStream = async (validateInput?: ValidateInput<number>) => {
    const { runtime, dispatchRuntimeMessage } = makeRuntime();
    const duplexStreamP = ChromeRuntimeDuplexStream.make(
      asChromeRuntime(runtime),
      'background',
      'offscreen',
      validateInput,
    );
    dispatchRuntimeMessage(makeAck());

    return [await duplexStreamP, { runtime, dispatchRuntimeMessage }] as const;
  };

  it('throws an error when localTarget and remoteTarget are the same', async () => {
    const { runtime } = makeRuntime();

    await expect(
      ChromeRuntimeDuplexStream.make(
        asChromeRuntime(runtime),
        'background',
        'background',
      ),
    ).rejects.toThrow('localTarget and remoteTarget must be different');
  });

  it('constructs a ChromeRuntimeDuplexStream', async () => {
    const [duplexStream] = await makeDuplexStream();

    expect(duplexStream).toBeInstanceOf(ChromeRuntimeDuplexStream);
    expect(duplexStream[Symbol.asyncIterator]()).toBe(duplexStream);
  });

  it('calls validateInput with received input if specified', async () => {
    const validateInput = vi
      .fn()
      .mockReturnValue(true) as unknown as ValidateInput<number>;
    const [duplexStream, { dispatchRuntimeMessage }] =
      await makeDuplexStream(validateInput);

    const message = { foo: 'bar' };
    dispatchRuntimeMessage(message);

    expect(await duplexStream.next()).toStrictEqual(makePendingResult(message));
    expect(validateInput).toHaveBeenCalledWith(message);
  });

  it('ends the reader when the writer ends', async () => {
    const [duplexStream, { runtime }] = await makeDuplexStream();
    runtime.sendMessage.mockImplementationOnce(() => {
      throw new Error('foo');
    });

    await expect(duplexStream.write(42)).rejects.toThrow(
      'ChromeRuntimeDuplexStream experienced a dispatch failure',
    );
    expect(await duplexStream.next()).toStrictEqual(makeDoneResult());
  });

  it('ends the writer when the reader ends', async () => {
    const [duplexStream, { dispatchRuntimeMessage }] = await makeDuplexStream();

    const readP = duplexStream.next();
    dispatchRuntimeMessage(makeStreamDoneSignal());
    await delay(10);
    expect(await duplexStream.write(42)).toStrictEqual(makeDoneResult());
    expect(await readP).toStrictEqual(makeDoneResult());
  });
});
