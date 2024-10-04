import { makeErrorMatcherFactory, makePromiseKitMock } from '@ocap/test-utils';
import { describe, it, expect, vi } from 'vitest';

import {
  makePostMessageStreamPair,
  PostMessageReader,
  PostMessageWriter,
} from './PostMessageStream.js';
import { makeDoneResult, makePendingResult } from './utils.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

const makeErrorMatcher = makeErrorMatcherFactory(expect);

// This function declares its own return type.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const makePostMessageMock = () => {
  const listeners: ((event: MessageEvent) => void)[] = [];
  const postMessageFn = vi.fn((message: unknown) => {
    listeners.forEach((listener) =>
      listener({ data: message } as MessageEvent<unknown>),
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

    const message = makePendingResult({ foo: 'bar' });

    postMessageFn(message);
    expect(await reader.next()).toStrictEqual(message);
  });

  it('removes its listener when it ends', async () => {
    const { postMessageFn, setListener, removeListener, listeners } =
      makePostMessageMock();
    const reader = new PostMessageReader(setListener, removeListener);
    expect(listeners).toHaveLength(1);

    const message = makeDoneResult();
    postMessageFn(message);

    expect(await reader.next()).toStrictEqual(message);
    expect(removeListener).toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
  });

  it('calls onEnd once when ending', async () => {
    const { postMessageFn, setListener, removeListener } =
      makePostMessageMock();
    const onEnd = vi.fn();
    const reader = new PostMessageReader(setListener, removeListener, onEnd);

    postMessageFn(makeDoneResult());

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
    expect(postMessageFn).toHaveBeenCalledWith(makePendingResult(message));
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

describe('makePostMessageStreamPair', () => {
  it('returns a pair of PostMessage streams', () => {
    const { setListener, removeListener } = makePostMessageMock();
    const postMessageFn = vi.fn();
    const { reader, writer } = makePostMessageStreamPair(
      postMessageFn,
      setListener,
      removeListener,
    );

    expect(reader).toBeInstanceOf(PostMessageReader);
    expect(writer).toBeInstanceOf(PostMessageWriter);
  });

  it('return() calls return() on both streams', async () => {
    const { setListener, removeListener, listeners } = makePostMessageMock();
    const postMessageFn = vi.fn();
    const streamPair = makePostMessageStreamPair<string>(
      postMessageFn,
      setListener,
      removeListener,
    );
    expect(listeners).toHaveLength(1);

    await streamPair.return();

    expect(await streamPair.writer.next('foo')).toStrictEqual(makeDoneResult());
    expect(await streamPair.reader.next(undefined)).toStrictEqual(
      makeDoneResult(),
    );
    expect(postMessageFn).toHaveBeenCalledTimes(1);
    expect(postMessageFn).toHaveBeenCalledWith(makeDoneResult());
    expect(listeners).toHaveLength(0);
  });

  it('throw() calls throw() on the writer but return on the reader', async () => {
    const { setListener, removeListener, listeners } = makePostMessageMock();
    const postMessageFn = vi.fn();
    const streamPair = makePostMessageStreamPair(
      postMessageFn,
      setListener,
      removeListener,
    );
    expect(listeners).toHaveLength(1);

    await streamPair.throw(new Error('foo'));

    expect(await streamPair.writer.next('foo')).toStrictEqual(makeDoneResult());
    expect(await streamPair.reader.next(undefined)).toStrictEqual(
      makeDoneResult(),
    );
    expect(postMessageFn).toHaveBeenCalledTimes(1);
    expect(postMessageFn).toHaveBeenCalledWith(makeErrorMatcher('foo'));
    expect(listeners).toHaveLength(0);
  });
});
