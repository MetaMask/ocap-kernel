import { makeErrorMatcherFactory, makePromiseKitMock } from '@ocap/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { BaseReader, BaseWriter } from './BaseStream.js';
import {
  makeDoneResult,
  makePendingResult,
  makeStreamDoneSignal,
  makeStreamErrorSignal,
  StreamSentinel,
} from './utils.js';
import { TestReader, TestWriter } from '../test/stream-mocks.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

const makeErrorMatcher = makeErrorMatcherFactory(expect);

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
      reader.receiveInput(message);

      expect(await reader.next()).toStrictEqual(makePendingResult(message));
    });

    it('emits message received after next()', async () => {
      const reader = new TestReader();

      const nextP = reader.next();
      const message = 42;
      reader.receiveInput(message);

      expect(await nextP).toStrictEqual(makePendingResult(message));
    });

    it('iterates over multiple messages', async () => {
      const reader = new TestReader();

      const messages = [1, 2, 3];
      messages.forEach((message) => reader.receiveInput(message));

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

      const unexpectedMessage = Symbol('foo');
      reader.receiveInput(unexpectedMessage);

      await expect(reader.next()).rejects.toThrow(
        'Received unexpected message from transport',
      );
    });

    it('throws after receiving unexpected message, after read is enqueued', async () => {
      const reader = new TestReader();

      const nextP = reader.next();
      const unexpectedMessage = Symbol('foo');
      reader.receiveInput(unexpectedMessage);

      await expect(nextP).rejects.toThrow(
        'Received unexpected message from transport',
      );
    });

    it('throws after receiving marshaled error, before read is enqueued', async () => {
      const reader = new TestReader();

      reader.receiveInput(makeStreamErrorSignal(new Error('foo')));

      await expect(reader.next()).rejects.toThrow('foo');
    });

    it('throws after receiving marshaled error, after read is enqueued', async () => {
      const reader = new TestReader();

      const nextP = reader.next();
      reader.receiveInput(makeStreamErrorSignal(new Error('foo')));

      await expect(nextP).rejects.toThrow('foo');
    });

    it('ends after receiving done signal, before read is enqueued', async () => {
      const reader = new TestReader();

      reader.receiveInput(makeStreamDoneSignal());

      expect(await reader.next()).toStrictEqual(makeDoneResult());
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('ends after receiving done signal, after read is enqueued', async () => {
      const reader = new TestReader();

      const nextP = reader.next();
      reader.receiveInput(makeStreamDoneSignal());

      expect(await nextP).toStrictEqual(makeDoneResult());
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('enqueues input before returning', async () => {
      const reader = new TestReader();

      reader.receiveInput(1);
      await reader.return();

      expect(await reader.next()).toStrictEqual(makePendingResult(1));
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('ignores input after returning', async () => {
      const reader = new TestReader();

      await reader.return();
      reader.receiveInput(1);

      expect(await reader.next()).toStrictEqual(makeDoneResult());
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('enqueues input before throwing', async () => {
      const reader = new TestReader();

      reader.receiveInput(1);
      reader.receiveInput(makeStreamErrorSignal(new Error('foo')));

      expect(await reader.next()).toStrictEqual(makePendingResult(1));
      await expect(reader.next()).rejects.toThrow('foo');
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('ignores input after throwing', async () => {
      const reader = new TestReader();

      reader.receiveInput(makeStreamErrorSignal(new Error('foo')));
      reader.receiveInput(1);

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
      expect(dispatchSpy).toHaveBeenCalledWith(message);
    });

    it('throws if failing to dispatch a message', async () => {
      const dispatchSpy = vi.fn().mockImplementationOnce(() => {
        throw new Error('foo');
      });
      const writer = new TestWriter(dispatchSpy);

      expect(await writer.next(42)).toStrictEqual(makeDoneResult());
      expect(dispatchSpy).toHaveBeenCalledTimes(2);
      expect(dispatchSpy).toHaveBeenNthCalledWith(1, 42);
      expect(dispatchSpy).toHaveBeenNthCalledWith(2, {
        [StreamSentinel.Error]: true,
        error: makeErrorMatcher('foo'),
      });
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
      expect(dispatchSpy).toHaveBeenNthCalledWith(1, 42);
      expect(dispatchSpy).toHaveBeenNthCalledWith(2, {
        [StreamSentinel.Error]: true,
        error: makeErrorMatcher('foo'),
      });
      expect(dispatchSpy).toHaveBeenNthCalledWith(3, {
        [StreamSentinel.Error]: true,
        error: makeErrorMatcher(
          'TestWriter experienced repeated dispatch failures.',
        ),
      });
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
