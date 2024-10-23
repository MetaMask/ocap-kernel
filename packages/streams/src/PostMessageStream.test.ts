import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { describe, it, expect, vi } from 'vitest';

import {
  PostMessageDuplexStream,
  PostMessageReader,
  PostMessageWriter,
} from './PostMessageStream.js';
import {
  makeDoneResult,
  makePendingResult,
  makeStreamDoneSignal,
} from './utils.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

// This function declares its own return type.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const makePostMessageMock = () => {
  const listeners: ((event: MessageEvent) => void)[] = [];
  const postMessageFn = vi.fn((message: unknown, ports: MessagePort[] = []) => {
    listeners.forEach((listener) =>
      listener({ data: message, ports } as unknown as MessageEvent<unknown>),
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
    const reader = new PostMessageReader(setListener, removeListener);
    expect(reader).toBeInstanceOf(PostMessageReader);
  });

  it('emits messages received from postMessage', async () => {
    const { postMessageFn, setListener, removeListener } =
      makePostMessageMock();
    const reader = new PostMessageReader(setListener, removeListener);

    const message = { foo: 'bar' };

    postMessageFn(message);
    expect(await reader.next()).toStrictEqual(makePendingResult(message));
  });

  it('removes its listener when it ends', async () => {
    const { postMessageFn, setListener, removeListener, listeners } =
      makePostMessageMock();
    const reader = new PostMessageReader(setListener, removeListener);
    expect(listeners).toHaveLength(1);

    const message = makeStreamDoneSignal();
    postMessageFn(message);

    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(removeListener).toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
  });

  it('ignores messages with ports', async () => {
    const { postMessageFn, setListener, removeListener } =
      makePostMessageMock();
    const reader = new PostMessageReader(setListener, removeListener);
    const { port1 } = new MessageChannel();

    postMessageFn(makeDoneResult(), [port1]);
    postMessageFn({ foo: 'bar' });
    await delay(100);

    expect(await reader.next()).toStrictEqual(
      makePendingResult({ foo: 'bar' }),
    );
  });

  it('calls onEnd once when ending', async () => {
    const { postMessageFn, setListener, removeListener } =
      makePostMessageMock();
    const onEnd = vi.fn();
    const reader = new PostMessageReader(setListener, removeListener, onEnd);

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
    await writer.next(message);
    expect(postMessageFn).toHaveBeenCalledWith(message);
  });

  it('calls onEnd once when ending', async () => {
    const { postMessageFn } = makePostMessageMock();
    const onEnd = vi.fn();
    const writer = new PostMessageWriter(postMessageFn, onEnd);

    expect(await writer.return()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(await writer.return()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('PostMessageDuplexStream', () => {
  it('constructs a PostMessageDuplexStream', () => {
    const { setListener, removeListener } = makePostMessageMock();
    const duplexStream = new PostMessageDuplexStream(
      () => undefined,
      setListener,
      removeListener,
    );

    expect(duplexStream).toBeInstanceOf(PostMessageDuplexStream);
    expect(duplexStream[Symbol.asyncIterator]()).toBe(duplexStream);
  });

  it('ends the reader when the writer ends', async () => {
    const { setListener, removeListener } = makePostMessageMock();
    const duplexStream = new PostMessageDuplexStream(
      vi.fn(() => {
        throw new Error('foo');
      }),
      setListener,
      removeListener,
    );

    await expect(duplexStream.write(42)).rejects.toThrow('foo');
    expect(await duplexStream.next()).toStrictEqual(makeDoneResult());
  });

  it('ends the writer when the reader ends', async () => {
    const { postMessageFn, setListener, removeListener } =
      makePostMessageMock();
    const duplexStream = new PostMessageDuplexStream(
      () => undefined,
      setListener,
      removeListener,
    );

    const readP = duplexStream.next();
    postMessageFn(makeStreamDoneSignal());
    await delay(10);
    expect(await duplexStream.write(42)).toStrictEqual(makeDoneResult());
    expect(await readP).toStrictEqual(makeDoneResult());
  });
});
