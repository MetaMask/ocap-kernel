import { makeErrorMatcherFactory, makePromiseKitMock } from '@ocap/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { Dispatch, ReceiveInput } from './BaseStream.js';
import { BaseDuplexStream, BaseReader, BaseWriter } from './BaseStream.js';
import { makeDoneResult, makePendingResult, marshalError } from './utils.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

const makeErrorMatcher = makeErrorMatcherFactory(expect);

class TestReader extends BaseReader<number> {
  receiveInput: ReceiveInput;

  constructor(onEnd?: () => void) {
    super(onEnd);
    this.receiveInput = super.getReceiveInput();
  }

  getReceiveInput(): ReceiveInput {
    return super.getReceiveInput();
  }
}

class TestWriter extends BaseWriter<number> {
  constructor(onDispatch: Dispatch<number>, onEnd?: () => void) {
    super('TestWriter', onDispatch, onEnd);
  }
}

class TestDuplexStream extends BaseDuplexStream<
  number,
  TestReader,
  number,
  TestWriter
> {
  constructor(
    onDispatch: Dispatch<number>,
    {
      readerOnEnd,
      writerOnEnd,
    }: { readerOnEnd?: () => void; writerOnEnd?: () => void } = {},
  ) {
    super(new TestReader(readerOnEnd), new TestWriter(onDispatch, writerOnEnd));
  }
}

describe('BaseReader', () => {
  describe('initialization', () => {
    it('constructs a BaseReader', () => {
      const reader = new TestReader();
      expect(reader).toBeInstanceOf(BaseReader);
      expect(reader[Symbol.asyncIterator]()).toBe(reader);
    });

    it('throws if getReceiveInput is called more than once', () => {
      const reader = new TestReader();
      expect(() => reader.getReceiveInput()).toThrow(
        'receiveInput has already been accessed',
      );
    });

    it('calls onEnd once when ending', async () => {
      const onEnd = vi.fn();
      const reader = new TestReader(onEnd);
      expect(onEnd).not.toHaveBeenCalled();

      await reader.return();
      expect(onEnd).toHaveBeenCalledOnce();
      await reader.return();
      expect(onEnd).toHaveBeenCalledOnce();
    });
  });

  describe('next and iteration', () => {
    it('emits message received before next()', async () => {
      const reader = new TestReader();

      const message = 42;
      reader.receiveInput(makePendingResult(message));

      expect(await reader.next()).toStrictEqual(makePendingResult(message));
    });

    it('emits message received after next()', async () => {
      const reader = new TestReader();

      const nextP = reader.next();
      const message = 42;
      reader.receiveInput(makePendingResult(message));

      expect(await nextP).toStrictEqual(makePendingResult(message));
    });

    it('iterates over multiple messages', async () => {
      const reader = new TestReader();

      const messages = [1, 2, 3];
      messages.forEach((message) =>
        reader.receiveInput(makePendingResult(message)),
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

    it('throws after receiving unexpected message, before read is enqueued', async () => {
      const reader = new TestReader();

      const unexpectedMessage = { foo: 'bar' };
      reader.receiveInput(unexpectedMessage);

      await expect(reader.next()).rejects.toThrow(
        'Received invalid message from transport',
      );
    });

    it('throws after receiving unexpected message, after read is enqueued', async () => {
      const reader = new TestReader();

      const nextP = reader.next();
      const unexpectedMessage = { foo: 'bar' };
      reader.receiveInput(unexpectedMessage);

      await expect(nextP).rejects.toThrow(
        'Received invalid message from transport',
      );
    });

    it('throws after receiving marshaled error, before read is enqueued', async () => {
      const reader = new TestReader();

      reader.receiveInput(marshalError(new Error('foo')));

      await expect(reader.next()).rejects.toThrow('foo');
    });

    it('throws after receiving marshaled error, after read is enqueued', async () => {
      const reader = new TestReader();

      const nextP = reader.next();
      reader.receiveInput(marshalError(new Error('foo')));

      await expect(nextP).rejects.toThrow('foo');
    });

    it('ends after receiving final iterator result, before read is enqueued', async () => {
      const reader = new TestReader();

      reader.receiveInput(makeDoneResult());

      expect(await reader.next()).toStrictEqual(makeDoneResult());
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('ends after receiving final iterator result, after read is enqueued', async () => {
      const reader = new TestReader();

      const nextP = reader.next();
      reader.receiveInput(makeDoneResult());

      expect(await nextP).toStrictEqual(makeDoneResult());
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('enqueues input before returning', async () => {
      const reader = new TestReader();

      reader.receiveInput(makePendingResult(1));
      await reader.return();

      expect(await reader.next()).toStrictEqual(makePendingResult(1));
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('ignores input after returning', async () => {
      const reader = new TestReader();

      await reader.return();
      reader.receiveInput(makePendingResult(1));

      expect(await reader.next()).toStrictEqual(makeDoneResult());
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('enqueues input before throwing', async () => {
      const reader = new TestReader();

      reader.receiveInput(makePendingResult(1));
      reader.receiveInput(marshalError(new Error('foo')));

      expect(await reader.next()).toStrictEqual(makePendingResult(1));
      await expect(reader.next()).rejects.toThrow('foo');
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('ignores input after throwing', async () => {
      const reader = new TestReader();

      reader.receiveInput(marshalError(new Error('foo')));
      reader.receiveInput(makePendingResult(1));

      await expect(reader.next()).rejects.toThrow('foo');
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });
  });

  describe('return', () => {
    it('ends the stream', async () => {
      const reader = new TestReader();

      expect(await reader.return()).toStrictEqual(makeDoneResult());
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const reader = new TestReader();

      expect(await reader.return()).toStrictEqual(makeDoneResult());
      expect(await reader.return()).toStrictEqual(makeDoneResult());
    });

    it('resolves pending read promises', async () => {
      const reader = new TestReader();

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
      const reader = new TestReader();

      expect(await reader.throw(new Error('foo'))).toStrictEqual(
        makeDoneResult(),
      );
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const reader = new TestReader();

      expect(await reader.throw(new Error())).toStrictEqual(makeDoneResult());
      expect(await reader.throw(new Error())).toStrictEqual(makeDoneResult());
    });

    it('rejects pending read promises', async () => {
      const reader = new TestReader();

      const nextP1 = reader.next();
      const nextP2 = reader.next();
      const throwP = reader.throw(new Error('foo'));

      await expect(nextP1).rejects.toThrow(new Error('foo'));
      await expect(nextP2).rejects.toThrow(new Error('foo'));
      expect(await throwP).toStrictEqual(makeDoneResult());
    });
  });
});

describe('BaseWriter', () => {
  describe('initialization', () => {
    it('constructs a BaseWriter', () => {
      const writer = new TestWriter(() => undefined);
      expect(writer).toBeInstanceOf(BaseWriter);
      expect(writer[Symbol.asyncIterator]()).toBe(writer);
    });

    it('calls onEnd once when ending', async () => {
      const onEnd = vi.fn();
      const writer = new TestWriter(() => undefined, onEnd);
      expect(onEnd).not.toHaveBeenCalled();

      await writer.return();
      expect(onEnd).toHaveBeenCalledOnce();
      await writer.return();
      expect(onEnd).toHaveBeenCalledOnce();
    });
  });

  describe('next and sending messages', () => {
    it('dispatches messages', async () => {
      const dispatchSpy = vi.fn();
      const writer = new TestWriter(dispatchSpy);

      const message = 42;
      const nextP = writer.next(message);

      expect(await nextP).toStrictEqual(makePendingResult(undefined));
      expect(dispatchSpy).toHaveBeenCalledWith(makePendingResult(message));
    });

    it('throws if failing to dispatch a message', async () => {
      const dispatchSpy = vi.fn().mockImplementationOnce(() => {
        throw new Error('foo');
      });
      const writer = new TestWriter(dispatchSpy);

      expect(await writer.next(42)).toStrictEqual(makeDoneResult());
      expect(dispatchSpy).toHaveBeenCalledTimes(2);
      expect(dispatchSpy).toHaveBeenNthCalledWith(1, makePendingResult(42));
      expect(dispatchSpy).toHaveBeenNthCalledWith(2, makeErrorMatcher('foo'));
    });

    it('failing to dispatch a message logs the error', async () => {
      const dispatchSpy = vi.fn().mockImplementationOnce(() => {
        throw new Error('foo');
      });
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const writer = new TestWriter(dispatchSpy);

      expect(await writer.next(42)).toStrictEqual(makeDoneResult());
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'TestWriter experienced a dispatch failure:',
        new Error('foo'),
      );
    });

    it('handles repeated failures to dispatch messages', async () => {
      const dispatchSpy = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('foo');
        })
        .mockImplementationOnce(() => {
          throw new Error('foo');
        });
      const writer = new TestWriter(dispatchSpy);

      await expect(writer.next(42)).rejects.toThrow(
        'TestWriter experienced repeated dispatch failures.',
      );
      expect(dispatchSpy).toHaveBeenCalledTimes(3);
      expect(dispatchSpy).toHaveBeenNthCalledWith(1, makePendingResult(42));
      expect(dispatchSpy).toHaveBeenNthCalledWith(2, makeErrorMatcher('foo'));
      expect(dispatchSpy).toHaveBeenNthCalledWith(
        3,
        makeErrorMatcher('TestWriter experienced repeated dispatch failures.'),
      );
    });
  });

  describe('return', () => {
    it('ends the stream', async () => {
      const writer = new TestWriter(() => undefined);

      expect(await writer.return()).toStrictEqual(makeDoneResult());
      expect(await writer.next(42)).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const writer = new TestWriter(() => undefined);

      expect(await writer.return()).toStrictEqual(makeDoneResult());
      expect(await writer.return()).toStrictEqual(makeDoneResult());
    });
  });

  describe('throw', () => {
    it('ends the stream', async () => {
      const writer = new TestWriter(() => undefined);

      expect(await writer.throw(new Error())).toStrictEqual(makeDoneResult());
      expect(await writer.next(42)).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const writer = new TestWriter(() => undefined);

      expect(await writer.throw(new Error())).toStrictEqual(makeDoneResult());
      expect(await writer.throw(new Error())).toStrictEqual(makeDoneResult());
    });
  });
});

describe('BaseDuplexStream', () => {
  it('constructs a BaseDuplexStream', () => {
    const duplexStream = new TestDuplexStream(() => undefined);
    expect(duplexStream).toBeInstanceOf(BaseDuplexStream);
    expect(duplexStream.reader).toBeInstanceOf(BaseReader);
    expect(duplexStream.writer).toBeInstanceOf(BaseWriter);
  });

  it('reads from the reader', async () => {
    const duplexStream = new TestDuplexStream(() => undefined);

    const message = 42;
    duplexStream.reader.receiveInput(makePendingResult(message));

    expect(await duplexStream.read()).toStrictEqual(makePendingResult(message));
  });

  it('drains the reader', async () => {
    const duplexStream = new TestDuplexStream(() => undefined);
    const readerSpy = vi.spyOn(duplexStream.reader, 'next');

    const messages = [1, 2, 3];
    messages.forEach((message) =>
      duplexStream.reader.receiveInput(makePendingResult(message)),
    );
    await duplexStream.reader.return();

    let index = 0;
    const drainFn = vi.fn((value: number) => {
      expect(value).toStrictEqual(messages[index]);
      index += 1;
    });

    await duplexStream.drain(drainFn);
    expect(drainFn).toHaveBeenCalledTimes(messages.length);
    expect(readerSpy).toHaveBeenCalledTimes(messages.length + 1);
  });

  it('writes to the writer', async () => {
    const duplexStream = new TestDuplexStream(() => undefined);
    const writerSpy = vi.spyOn(duplexStream.writer, 'next');

    const message = 42;
    await duplexStream.write(message);
    expect(writerSpy).toHaveBeenCalledWith(message);
  });

  it('return calls return on both reader and writer', async () => {
    const duplexStream = new TestDuplexStream(() => undefined);
    const readerSpy = vi.spyOn(duplexStream.reader, 'return');
    const writerSpy = vi.spyOn(duplexStream.writer, 'return');

    await duplexStream.return();
    expect(readerSpy).toHaveBeenCalledOnce();
    expect(writerSpy).toHaveBeenCalledOnce();
  });

  it('throw calls throw on the writer but return on the reader', async () => {
    const duplexStream = new TestDuplexStream(() => undefined);
    const readerReturnSpy = vi.spyOn(duplexStream.reader, 'return');
    const writerThrowSpy = vi.spyOn(duplexStream.writer, 'throw');

    await duplexStream.throw(new Error('foo'));
    expect(readerReturnSpy).toHaveBeenCalledOnce();
    expect(writerThrowSpy).toHaveBeenCalledWith(new Error('foo'));
  });

  it('ending the reader calls reader onEnd function', async () => {
    const readerOnEnd = vi.fn();
    const duplexStream = new TestDuplexStream(() => undefined, { readerOnEnd });

    await duplexStream.reader.return();
    expect(readerOnEnd).toHaveBeenCalledOnce();
  });

  it('ending the writer calls writer onEnd function', async () => {
    const writerOnEnd = vi.fn();
    const duplexStream = new TestDuplexStream(() => undefined, { writerOnEnd });

    await duplexStream.writer.return();
    expect(writerOnEnd).toHaveBeenCalledOnce();
  });
});
