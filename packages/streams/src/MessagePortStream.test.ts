import type { Json } from '@metamask/utils';
import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { describe, expect, it, vi } from 'vitest';

import {
  makeMessagePortStreamPair,
  MessagePortReader,
  MessagePortWriter,
} from './MessagePortStream.js';
import { makeDoneResult, makePendingResult } from './utils.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

describe.concurrent('MessagePortReader', () => {
  it('constructs a MessagePortReader', () => {
    const { port1 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    expect(reader).toBeInstanceOf(MessagePortReader);
    expect(reader[Symbol.asyncIterator]()).toBe(reader);
    expect(port1.onmessage).toBeInstanceOf(Function);
  });

  describe('next and iteration', () => {
    it('emits message port message received before next()', async () => {
      const { port1, port2 } = new MessageChannel();
      const reader = new MessagePortReader(port1);

      const message = { foo: 'bar' };
      port2.postMessage(makePendingResult(message));
      await delay(100);

      expect(await reader.next()).toStrictEqual(makePendingResult(message));
    });

    it('emits message port message received after next()', async () => {
      const { port1, port2 } = new MessageChannel();
      const reader = new MessagePortReader(port1);

      const nextP = reader.next();
      const message = { foo: 'bar' };
      port2.postMessage(makePendingResult(message));

      expect(await nextP).toStrictEqual(makePendingResult(message));
    });

    it('iterates over multiple port messages', async () => {
      const { port1, port2 } = new MessageChannel();
      const reader = new MessagePortReader(port1);

      const messages = [{ foo: 'bar' }, { bar: 'baz' }, { baz: 'qux' }];
      messages.forEach((message) =>
        port2.postMessage(makePendingResult(message)),
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
      'throws after receiving unexpected message from port, before read is enqueued',
      async () => {
        const { port1, port2 } = new MessageChannel();
        const reader = new MessagePortReader(port1);

        const unexpectedMessage = { foo: 'bar' };
        port2.postMessage(unexpectedMessage);
        await delay(100);

        await expect(reader.next()).rejects.toThrow(
          'Received unexpected message from transport',
        );
      },
    );

    it('throws after receiving unexpected message from port, after read is enqueued', async () => {
      const { port1, port2 } = new MessageChannel();
      const reader = new MessagePortReader(port1);

      const nextP = reader.next();
      const unexpectedMessage = { foo: 'bar' };
      port2.postMessage(unexpectedMessage);

      await expect(nextP).rejects.toThrow(
        'Received unexpected message from transport',
      );
    });

    it('ends after receiving final iterator result from port, before read is enqueued', async () => {
      const { port1, port2 } = new MessageChannel();
      const reader = new MessagePortReader(port1);

      port2.postMessage(makeDoneResult());
      await delay(100);

      expect(await reader.next()).toStrictEqual(makeDoneResult());
      expect(port1.onmessage).toBeNull();

      // Ending is a terminal state.
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('ends after receiving final iterator result from port, after read is enqueued', async () => {
      const { port1, port2 } = new MessageChannel();
      const reader = new MessagePortReader(port1);

      const nextP = reader.next();
      port2.postMessage(makeDoneResult());

      expect(await nextP).toStrictEqual(makeDoneResult());
      expect(port1.onmessage).toBeNull();

      // Ending is a terminal state.
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });
  });

  describe('return', () => {
    it('ends the stream', async () => {
      const { port1 } = new MessageChannel();
      const reader = new MessagePortReader(port1);

      expect(await reader.return()).toStrictEqual(makeDoneResult());
      expect(port1.onmessage).toBeNull();
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const { port1 } = new MessageChannel();
      const reader = new MessagePortReader(port1);

      expect(await reader.return()).toStrictEqual(makeDoneResult());
      expect(await reader.return()).toStrictEqual(makeDoneResult());
    });

    it('resolves pending read promises', async () => {
      const { port1 } = new MessageChannel();
      const reader = new MessagePortReader(port1);

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
      const { port1 } = new MessageChannel();
      const reader = new MessagePortReader(port1);

      expect(await reader.throw(new Error())).toStrictEqual(makeDoneResult());
      expect(port1.onmessage).toBeNull();
      expect(await reader.next()).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const { port1 } = new MessageChannel();
      const reader = new MessagePortReader(port1);

      expect(await reader.throw(new Error())).toStrictEqual(makeDoneResult());
      expect(await reader.throw(new Error())).toStrictEqual(makeDoneResult());
    });

    it('rejects pending read promises', async () => {
      const { port1 } = new MessageChannel();
      const reader = new MessagePortReader(port1);

      const nextP1 = reader.next();
      const nextP2 = reader.next();
      const throwP = reader.throw(new Error('foo'));

      await expect(nextP1).rejects.toThrow(new Error('foo'));
      await expect(nextP2).rejects.toThrow(new Error('foo'));
      expect(await throwP).toStrictEqual(makeDoneResult());
    });
  });
});

describe.concurrent('MessagePortWriter', () => {
  it('constructs a MessagePortWriter', () => {
    const { port1 } = new MessageChannel();
    const writer = new MessagePortWriter(port1);

    expect(writer).toBeInstanceOf(MessagePortWriter);
    expect(writer[Symbol.asyncIterator]()).toBe(writer);
  });

  describe('next and sending messages', () => {
    it('posts messages to the port', async () => {
      const { port1, port2 } = new MessageChannel();
      const writer = new MessagePortWriter(port1);

      const message = { foo: 'bar' };
      const messageP = new Promise((resolve) => {
        port2.onmessage = (messageEvent): void => resolve(messageEvent.data);
      });
      const nextP = writer.next(message);

      expect(await nextP).toStrictEqual(makePendingResult(undefined));
      expect(await messageP).toStrictEqual(makePendingResult(message));
    });

    it('throws if failing to send a message', async () => {
      const { port1 } = new MessageChannel();
      const postMessageSpy = vi
        .spyOn(port1, 'postMessage')
        .mockImplementationOnce(() => {
          throw new Error('foo');
        });
      const writer = new MessagePortWriter(port1);

      expect(await writer.next(null)).toStrictEqual(makeDoneResult());
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenNthCalledWith(
        1,
        makePendingResult(null),
      );
      expect(postMessageSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          message: 'foo',
          stack: expect.any(String),
        }),
      );
    });

    it('failing to send a message logs the error', async () => {
      const { port1 } = new MessageChannel();
      vi.spyOn(port1, 'postMessage').mockImplementationOnce(() => {
        throw new Error('foo');
      });
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const writer = new MessagePortWriter(port1);

      expect(await writer.next(null)).toStrictEqual(makeDoneResult());
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'MessagePortWriter experienced a dispatch failure:',
        new Error('foo'),
      );
    });

    it('handles repeated failures to send messages', async () => {
      const { port1 } = new MessageChannel();
      const postMessageSpy = vi
        .spyOn(port1, 'postMessage')
        .mockImplementationOnce(() => {
          throw new Error('foo');
        })
        .mockImplementationOnce(() => {
          throw new Error('foo');
        });
      const writer = new MessagePortWriter(port1);

      await expect(writer.next(null)).rejects.toThrow(
        'MessagePortWriter experienced repeated dispatch failures.',
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(3);
      expect(postMessageSpy).toHaveBeenNthCalledWith(
        1,
        makePendingResult(null),
      );
      expect(postMessageSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          message: 'foo',
          stack: expect.any(String),
        }),
      );
      expect(postMessageSpy).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          message: 'MessagePortWriter experienced repeated dispatch failures.',
          stack: expect.any(String),
        }),
      );
    });
  });

  describe('return', () => {
    it('ends the stream', async () => {
      const { port1 } = new MessageChannel();
      const writer = new MessagePortWriter(port1);

      expect(await writer.return()).toStrictEqual(makeDoneResult());
      expect(await writer.next(null)).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const { port1 } = new MessageChannel();
      const writer = new MessagePortWriter(port1);

      expect(await writer.return()).toStrictEqual(makeDoneResult());
      expect(await writer.return()).toStrictEqual(makeDoneResult());
    });
  });

  describe('throw', () => {
    it('ends the stream', async () => {
      const { port1 } = new MessageChannel();
      const writer = new MessagePortWriter(port1);

      expect(await writer.throw(new Error())).toStrictEqual(makeDoneResult());
      expect(await writer.next(null)).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const { port1 } = new MessageChannel();
      const writer = new MessagePortWriter(port1);

      expect(await writer.throw(new Error())).toStrictEqual(makeDoneResult());
      expect(await writer.throw(new Error())).toStrictEqual(makeDoneResult());
    });
  });
});

describe('makeMessagePortStreamPair', () => {
  it('returns a pair of message ports', () => {
    const { port1 } = new MessageChannel();
    const { reader, writer } = makeMessagePortStreamPair(port1);

    expect(reader).toBeInstanceOf(MessagePortReader);
    expect(writer).toBeInstanceOf(MessagePortWriter);
  });

  it('return() calls return() on both streams', async () => {
    const { port1, port2 } = new MessageChannel();
    const streamPair = makeMessagePortStreamPair(port1);
    const remoteReader = new MessagePortReader(port2);
    const remoteReadP = remoteReader.next();

    expect(port1.onmessage).toBeDefined();
    expect(port2.onmessage).toBeDefined();

    await streamPair.return();

    expect(port1.onmessage).toBeNull();

    expect(await remoteReadP).toStrictEqual(makeDoneResult());
    expect(port2.onmessage).toBeNull();
  });

  it('throw() calls throw() on the writer but return on the reader', async () => {
    const { port1, port2 } = new MessageChannel();
    const streamPair = makeMessagePortStreamPair(port1);
    const remoteReader = new MessagePortReader(port2);
    const localReadP = (streamPair.reader as MessagePortReader<Json>).next();
    const remoteReadP = remoteReader.next();

    expect(port1.onmessage).toBeDefined();
    expect(port2.onmessage).toBeDefined();

    await streamPair.throw(new Error('foo'));

    expect(await localReadP).toStrictEqual(makeDoneResult());
    expect(port1.onmessage).toBeNull();

    await expect(remoteReadP).rejects.toThrow(
      expect.objectContaining({
        message: 'foo',
        stack: expect.any(String),
      }),
    );
    expect(port2.onmessage).toBeNull();
  });
});
