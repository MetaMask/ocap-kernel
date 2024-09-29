import { makePromiseKitMock } from '@ocap/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { Dispatch, ReceiveInput } from './BaseStream.js';
import { BaseReader, BaseWriter } from './BaseStream.js';
import { makeDoneResult } from './shared.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

class TestReader extends BaseReader<number> {
  receiveInput: ReceiveInput<number>;

  constructor(onEnd?: () => void) {
    super();
    this.receiveInput = super.getReceiveInput();
    onEnd && super.setOnEnd(onEnd);
  }

  getReceiveInput(): ReceiveInput<number> {
    return super.getReceiveInput();
  }

  setOnEnd(onEnd: () => void): void {
    super.setOnEnd(onEnd);
  }
}

class TestWriter extends BaseWriter<number> {
  constructor(onDispatch?: Dispatch<number>, onEnd?: () => void) {
    super('TestWriter');
    onDispatch && super.setOnDispatch(onDispatch);
    onEnd && super.setOnEnd(onEnd);
  }

  setOnDispatch(onDispatch: Dispatch<number>): void {
    super.setOnDispatch(onDispatch);
  }

  setOnEnd(onEnd: () => void): void {
    super.setOnEnd(onEnd);
  }
}

describe('BaseReader', () => {
  describe('initialization', () => {
    it('constructs a BaseReader', () => {
      const reader = new TestReader();
      expect(reader).toBeInstanceOf(BaseReader);
    });

    it('throws if getReceiveInput is called more than once', () => {
      const reader = new TestReader();
      expect(() => reader.getReceiveInput()).toThrow(
        'receiveInput has already been accessed',
      );
    });

    it('throws if setOnEnd is called more than once', () => {
      const reader = new TestReader(() => undefined);
      expect(() => reader.setOnEnd(() => undefined)).toThrow(
        'onEnd has already been set',
      );
    });

    it('calls onEnd when ending', async () => {
      const onEnd = vi.fn();
      const reader = new TestReader(onEnd);
      expect(onEnd).not.toHaveBeenCalled();

      await reader.return();
      expect(onEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('next and iteration', () => {
    it('emits message received before next()', async () => {
      const reader = new TestReader();

      const message = 42;
      reader.receiveInput({ done: false, value: message });

      expect(await reader.next()).toStrictEqual({
        done: false,
        value: message,
      });
    });

    it('emits message received after next()', async () => {
      const reader = new TestReader();

      const nextP = reader.next();
      const message = 42;
      reader.receiveInput({ done: false, value: message });

      expect(await nextP).toStrictEqual({ done: false, value: message });
    });

    it('iterates over multiple messages', async () => {
      const reader = new TestReader();

      const messages = [1, 2, 3];
      messages.forEach((message) =>
        reader.receiveInput({ done: false, value: message }),
      );

      let index = 0;
      for await (const message of reader) {
        expect(message).toStrictEqual(messages[index]);

        index += 1;
        if (index >= messages.length) {
          break;
        }
      }
    });

    it('throws when receiving unexpected message', async () => {
      const reader = new TestReader();

      const nextP = reader.next();
      const unexpectedMessage = { foo: 'bar' };
      // @ts-expect-error Intentional destructive testing
      reader.receiveInput(unexpectedMessage);

      await expect(nextP).rejects.toThrow(
        'Received unexpected message from transport',
      );
    });

    it('ends if receiving final iterator result', async () => {
      const reader = new TestReader();

      const nextP = reader.next();
      reader.receiveInput(makeDoneResult());

      expect(await nextP).toStrictEqual(makeDoneResult());
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

      expect(await reader.throw(new Error())).toStrictEqual(makeDoneResult());
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
    });

    it('throws if setOnDispatch is called more than once', () => {
      const writer = new TestWriter(() => undefined);
      expect(() => writer.setOnDispatch(() => undefined)).toThrow(
        'onDispatch has already been set',
      );
    });

    it('throws if setOnEnd is called more than once', () => {
      const writer = new TestWriter(
        () => undefined,
        () => undefined,
      );
      expect(() => writer.setOnEnd(() => undefined)).toThrow(
        'onEnd has already been set',
      );
    });

    it('throws if setOnDispatch was not set by subclass constructor', async () => {
      await expect(new TestWriter().next(42)).rejects.toThrow(
        'onDispatch has not been set',
      );
    });

    it('calls onEnd when ending', async () => {
      const onEnd = vi.fn();
      const writer = new TestWriter(() => undefined, onEnd);
      expect(onEnd).not.toHaveBeenCalled();

      await writer.return();
      expect(onEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('next and sending messages', () => {
    it('dispatches messages', async () => {
      const dispatchSpy = vi.fn();
      const writer = new TestWriter(dispatchSpy);

      const message = 42;
      const nextP = writer.next(message);

      expect(await nextP).toStrictEqual({
        done: false,
        value: undefined,
      });
      expect(dispatchSpy).toHaveBeenCalledWith({ done: false, value: message });
    });

    it('throws if failing to dispatch a message', async () => {
      const dispatchSpy = vi.fn().mockImplementationOnce(() => {
        throw new Error('foo');
      });
      const writer = new TestWriter(dispatchSpy);

      expect(await writer.next(42)).toStrictEqual(makeDoneResult());
      expect(dispatchSpy).toHaveBeenCalledTimes(2);
      expect(dispatchSpy).toHaveBeenNthCalledWith(1, {
        done: false,
        value: 42,
      });
      expect(dispatchSpy).toHaveBeenNthCalledWith(2, new Error('foo'));
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
      expect(dispatchSpy).toHaveBeenNthCalledWith(1, {
        done: false,
        value: 42,
      });
      expect(dispatchSpy).toHaveBeenNthCalledWith(2, new Error('foo'));
      expect(dispatchSpy).toHaveBeenNthCalledWith(
        3,
        new Error('TestWriter experienced repeated dispatch failures.'),
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
