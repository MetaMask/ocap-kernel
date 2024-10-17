import { describe, expect, it, vi } from 'vitest';

import { BaseDuplexStream } from './BaseDuplexStream.js';
import { makeDoneResult, makePendingResult } from './utils.js';
import { TestDuplexStream } from '../test/stream-mocks.js';

describe('BaseDuplexStream', () => {
  it('constructs a BaseDuplexStream', () => {
    const duplexStream = new TestDuplexStream(() => undefined);
    expect(duplexStream).toBeInstanceOf(BaseDuplexStream);
    expect(duplexStream[Symbol.asyncIterator]()).toBe(duplexStream);
  });

  it('reads from the reader', async () => {
    const duplexStream = new TestDuplexStream(() => undefined);

    const message = 42;
    duplexStream.receiveInput(message);

    expect(await duplexStream.next()).toStrictEqual(makePendingResult(message));
  });

  it('drains the reader in order', async () => {
    const duplexStream = new TestDuplexStream(() => undefined);

    const messages = [1, 2, 3];
    messages.forEach((message) => duplexStream.receiveInput(message));
    await duplexStream.return();

    let index = 0;
    const drainFn = vi.fn((value: number) => {
      expect(value).toStrictEqual(messages[index]);
      index += 1;
    });

    await duplexStream.drain(drainFn);
    expect(drainFn).toHaveBeenCalledTimes(messages.length);
    expect(drainFn).toHaveBeenNthCalledWith(1, 1);
    expect(drainFn).toHaveBeenNthCalledWith(2, 2);
    expect(drainFn).toHaveBeenNthCalledWith(3, 3);
  });

  it('writes to the writer', async () => {
    const onDispatch = vi.fn();
    const duplexStream = new TestDuplexStream(onDispatch);

    const message = 42;
    await duplexStream.write(message);
    expect(onDispatch).toHaveBeenCalledWith(message);
  });

  it('return calls ends both the reader and writer', async () => {
    const readerOnEnd = vi.fn();
    const writerOnEnd = vi.fn();
    const duplexStream = new TestDuplexStream(() => undefined, {
      readerOnEnd,
      writerOnEnd,
    });

    await duplexStream.return();
    expect(readerOnEnd).toHaveBeenCalledOnce();
    expect(writerOnEnd).toHaveBeenCalledOnce();
  });

  it('throw calls throw on the writer but return on the reader', async () => {
    const readerOnEnd = vi.fn();
    const writerOnEnd = vi.fn();
    const duplexStream = new TestDuplexStream(() => undefined, {
      readerOnEnd,
      writerOnEnd,
    });

    await duplexStream.throw(new Error('foo'));
    expect(readerOnEnd).toHaveBeenCalledOnce();
    expect(writerOnEnd).toHaveBeenCalledOnce();
  });

  it('ending the reader calls reader onEnd function', async () => {
    const readerOnEnd = vi.fn();
    const duplexStream = new TestDuplexStream(() => undefined, { readerOnEnd });

    duplexStream.receiveInput(makeDoneResult());
    expect(readerOnEnd).toHaveBeenCalledOnce();
  });

  it('ending the writer calls writer onEnd function', async () => {
    const onDispatch = vi.fn(() => {
      throw new Error('foo');
    });
    const writerOnEnd = vi.fn();
    const duplexStream = new TestDuplexStream(onDispatch, { writerOnEnd });

    await expect(duplexStream.write(42)).rejects.toThrow('foo');
    expect(writerOnEnd).toHaveBeenCalledOnce();
  });
});
