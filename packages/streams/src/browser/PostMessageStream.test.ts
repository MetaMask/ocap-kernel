import { delay } from '@ocap/test-utils';
import { describe, it, expect, vi } from 'vitest';

import {
  PostMessageDuplexStream,
  PostMessageReader,
  PostMessageWriter,
} from './PostMessageStream.js';
import type { PostMessage } from './utils.js';
import { makeAck } from '../BaseDuplexStream.js';
import type { ValidateInput } from '../BaseStream.js';
import {
  makeDoneResult,
  makePendingResult,
  makeStreamDoneSignal,
  makeStreamErrorSignal,
} from '../utils.js';

// This function declares its own return type.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const makePostMessageMock = () => {
  const listeners: ((event: MessageEvent) => void)[] = [];
  const postMessageFn = vi.fn((message: unknown) => {
    listeners.forEach((listener) =>
      listener(
        message instanceof MessageEvent
          ? message
          : new MessageEvent('message', { data: message }),
      ),
    );
  });
  const setListener = vi.fn((listener: (event: MessageEvent) => void) => {
    listeners.push(listener);
  });
  const removeListener = vi.fn((listener: (event: MessageEvent) => void) => {
    listeners.splice(listeners.indexOf(listener), 1);
  });
  return { postMessageFn, setListener, removeListener, listeners };
};

describe('PostMessageReader', () => {
  it('constructs a PostMessageReader', () => {
    const { setListener, removeListener } = makePostMessageMock();
    const reader = new PostMessageReader({
      setListener,
      removeListener,
    });
    expect(reader).toBeInstanceOf(PostMessageReader);
  });

  it('emits messages received from postMessage', async () => {
    const { postMessageFn, setListener, removeListener } =
      makePostMessageMock();
    const reader = new PostMessageReader({
      setListener,
      removeListener,
    });

    const message = { foo: 'bar' };

    postMessageFn(message);
    expect(await reader.next()).toStrictEqual(makePendingResult(message));
  });

  it('can yield MessageEvents directly', async () => {
    const { postMessageFn, setListener, removeListener } =
      makePostMessageMock();
    const reader = new PostMessageReader<MessageEvent>({
      setListener,
      removeListener,
      messageEventMode: 'event',
    });

    const message = new MessageEvent('message', { data: 'bar' });

    postMessageFn(message);
    expect(await reader.next()).toStrictEqual(makePendingResult(message));
  });

  it('handles stream done signals normally when yielding MessageEvents', async () => {
    const { postMessageFn, setListener, removeListener } =
      makePostMessageMock();
    const reader = new PostMessageReader<MessageEvent>({
      setListener,
      removeListener,
      messageEventMode: 'event',
    });

    postMessageFn(
      new MessageEvent('message', { data: makeStreamDoneSignal() }),
    );
    expect(await reader.next()).toStrictEqual(makeDoneResult());
  });

  it('handles stream error signals normally when yielding MessageEvents', async () => {
    const { postMessageFn, setListener, removeListener } =
      makePostMessageMock();
    const reader = new PostMessageReader<MessageEvent>({
      setListener,
      removeListener,
      messageEventMode: 'event',
    });

    const nextP = reader.next();

    postMessageFn(
      new MessageEvent('message', {
        data: makeStreamErrorSignal(new Error('foo')),
      }),
    );
    await expect(nextP).rejects.toThrow('foo');
  });

  it('calls validateInput with received input if specified', async () => {
    const validateInput = vi
      .fn()
      .mockReturnValue(true) as unknown as ValidateInput<number>;
    const { postMessageFn, setListener, removeListener } =
      makePostMessageMock();
    const reader = new PostMessageReader({
      setListener,
      removeListener,
      validateInput,
    });

    const message = { foo: 'bar' };
    postMessageFn(message);
    expect(await reader.next()).toStrictEqual(makePendingResult(message));
    expect(validateInput).toHaveBeenCalledWith(message);
  });

  it('throws if validateInput throws', async () => {
    const { postMessageFn, setListener, removeListener } =
      makePostMessageMock();
    const validateInput = (() => {
      throw new Error('foo');
    }) as unknown as ValidateInput<number>;
    const reader = new PostMessageReader({
      setListener,
      removeListener,
      validateInput,
    });

    postMessageFn(42);
    await expect(reader.next()).rejects.toThrow('foo');
    expect(await reader.next()).toStrictEqual(makeDoneResult());
  });

  it('removes its listener when it ends', async () => {
    const { postMessageFn, setListener, removeListener, listeners } =
      makePostMessageMock();
    const reader = new PostMessageReader({
      setListener,
      removeListener,
    });
    expect(listeners).toHaveLength(1);

    const message = makeStreamDoneSignal();
    postMessageFn(message);

    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(removeListener).toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
  });

  it('calls onEnd once when ending', async () => {
    const { postMessageFn, setListener, removeListener } =
      makePostMessageMock();
    const onEnd = vi.fn();
    const reader = new PostMessageReader({
      setListener,
      removeListener,
      onEnd,
    });

    postMessageFn(makeStreamDoneSignal());

    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('PostMessageWriter', () => {
  it('constructs a PostMessageWriter', () => {
    const writer = new PostMessageWriter(() => undefined);
    expect(writer).toBeInstanceOf(PostMessageWriter);
  });

  it('writes messages to postMessage', async () => {
    const { postMessageFn } = makePostMessageMock();
    const writer = new PostMessageWriter(postMessageFn);
    const message = { foo: 'bar' };
    await writer.next({ payload: message, transfer: [] });
    expect(postMessageFn).toHaveBeenCalledWith(message, []);
  });

  it('calls onEnd once when ending', async () => {
    const { postMessageFn } = makePostMessageMock();
    const onEnd = vi.fn();
    const writer = new PostMessageWriter(postMessageFn, { onEnd });

    expect(await writer.return()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(await writer.return()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('PostMessageDuplexStream', () => {
  const makeDuplexStream = async (
    sendMessage: PostMessage,
    postMessageMock: ReturnType<
      typeof makePostMessageMock
    > = makePostMessageMock(),
    validateInput?: ValidateInput<number>,
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  ) => {
    const { postMessageFn, setListener, removeListener } = postMessageMock;

    const duplexStreamP = PostMessageDuplexStream.make({
      postMessageFn: sendMessage,
      setListener,
      removeListener,
      validateInput,
    });
    postMessageFn(makeAck());
    await delay(10);

    return [await duplexStreamP, postMessageFn] as const;
  };

  it('constructs a PostMessageDuplexStream', async () => {
    const [duplexStream] = await makeDuplexStream(() => undefined);

    expect(duplexStream).toBeInstanceOf(PostMessageDuplexStream);
    expect(duplexStream[Symbol.asyncIterator]()).toBe(duplexStream);
  });

  it('calls validateInput with received input if specified', async () => {
    const validateInput = vi
      .fn()
      .mockReturnValue(true) as unknown as ValidateInput<number>;
    const postMessageMock = makePostMessageMock();
    const [duplexStream] = await makeDuplexStream(
      () => undefined,
      postMessageMock,
      validateInput,
    );

    postMessageMock.postMessageFn(42);
    expect(await duplexStream.next()).toStrictEqual(makePendingResult(42));
    expect(validateInput).toHaveBeenCalledWith(42);
  });

  it('ends the reader when the writer ends', async () => {
    const [duplexStream] = await makeDuplexStream(
      vi
        .fn()
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => {
          throw new Error('foo');
        }),
    );

    await expect(
      duplexStream.write({ payload: 42, transfer: [] }),
    ).rejects.toThrow('PostMessageDuplexStream experienced a dispatch failure');
    expect(await duplexStream.next()).toStrictEqual(makeDoneResult());
  });

  it('ends the writer when the reader ends', async () => {
    const [duplexStream, postMessageFn] = await makeDuplexStream(
      () => undefined,
    );

    const readP = duplexStream.next();
    postMessageFn(makeStreamDoneSignal());
    await delay(10);
    expect(
      await duplexStream.write({ payload: 42, transfer: [] }),
    ).toStrictEqual(makeDoneResult());
    expect(await readP).toStrictEqual(makeDoneResult());
  });
});
