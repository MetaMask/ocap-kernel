import { delay } from '@ocap/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { makeAck } from './BaseDuplexStream.js';
import {
  MessagePortDuplexStream,
  MessagePortReader,
  MessagePortWriter,
} from './MessagePortStream.js';
import {
  makeDoneResult,
  makePendingResult,
  makeStreamDoneSignal,
} from './utils.js';

describe('MessagePortReader', () => {
  it('constructs a MessagePortReader', () => {
    const { port1 } = new MessageChannel();
    const addListenerSpy = vi.spyOn(port1, 'addEventListener');
    const reader = new MessagePortReader(port1);

    expect(reader).toBeInstanceOf(MessagePortReader);
    expect(reader[Symbol.asyncIterator]()).toBe(reader);
    expect(addListenerSpy).toHaveBeenCalledOnce();
  });

  it('emits messages received from port', async () => {
    const { port1, port2 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    const message = { foo: 'bar' };
    port2.postMessage(message);
    await delay(10);

    expect(await reader.next()).toStrictEqual(makePendingResult(message));
  });

  it('closes the port when done', async () => {
    const { port1, port2 } = new MessageChannel();
    const closeSpy = vi.spyOn(port1, 'close');
    const addListenerSpy = vi.spyOn(port1, 'addEventListener');
    const removeListenerSpy = vi.spyOn(port1, 'removeEventListener');
    const reader = new MessagePortReader(port1);
    expect(addListenerSpy).toHaveBeenCalledOnce();

    port2.postMessage(makeStreamDoneSignal());
    await delay(10);

    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(closeSpy).toHaveBeenCalledOnce();
    expect(removeListenerSpy).toHaveBeenCalledOnce();
  });

  it('ignores messages with ports', async () => {
    const { port1, port2 } = new MessageChannel();
    const reader = new MessagePortReader(port1);
    const { port1: otherPort } = new MessageChannel();

    port2.postMessage(makeDoneResult(), [otherPort]);
    port2.postMessage({ foo: 'bar' });
    await delay(10);

    expect(await reader.next()).toStrictEqual(
      makePendingResult({ foo: 'bar' }),
    );
  });

  it('calls onEnd once when ending', async () => {
    const { port1, port2 } = new MessageChannel();
    const onEnd = vi.fn();
    const reader = new MessagePortReader(port1, onEnd);

    port2.postMessage(makeStreamDoneSignal());
    await delay(10);

    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('MessagePortWriter', () => {
  it('constructs a MessagePortWriter', () => {
    const { port1 } = new MessageChannel();
    const writer = new MessagePortWriter(port1);

    expect(writer).toBeInstanceOf(MessagePortWriter);
    expect(writer[Symbol.asyncIterator]()).toBe(writer);
  });

  it('writes messages to the port', async () => {
    const { port1, port2 } = new MessageChannel();
    const writer = new MessagePortWriter(port1);

    const message = { foo: 'bar' };
    const messageP = new Promise((resolve) => {
      port2.onmessage = (messageEvent): void => resolve(messageEvent.data);
    });
    const nextP = writer.next(message);

    expect(await nextP).toStrictEqual(makePendingResult(undefined));
    expect(await messageP).toStrictEqual(message);
  });

  it('closes the port when done', async () => {
    const { port1 } = new MessageChannel();
    const closeSpy = vi.spyOn(port1, 'close');
    const writer = new MessagePortWriter(port1);

    expect(await writer.return()).toStrictEqual(makeDoneResult());
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('calls onEnd once when ending', async () => {
    const { port1 } = new MessageChannel();
    const onEnd = vi.fn();
    const writer = new MessagePortWriter(port1, onEnd);

    expect(await writer.return()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(await writer.return()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('MessagePortDuplexStream', () => {
  const makeDuplexStream = async (
    channel: MessageChannel = new MessageChannel(),
  ): Promise<MessagePortDuplexStream<number>> => {
    const duplexStreamP = MessagePortDuplexStream.make<number>(channel.port1);
    channel.port2.postMessage(makeAck());
    await delay(10);

    return await duplexStreamP;
  };

  it('constructs a MessagePortDuplexStream', async () => {
    const duplexStream = await makeDuplexStream();

    expect(duplexStream).toBeInstanceOf(MessagePortDuplexStream);
    expect(duplexStream[Symbol.asyncIterator]()).toBe(duplexStream);
  });

  it('ends the reader when the writer ends', async () => {
    const { port1, port2 } = new MessageChannel();
    vi.spyOn(port1, 'postMessage')
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('foo');
      });
    const duplexStream = await makeDuplexStream({ port1, port2 });

    await expect(duplexStream.write(42)).rejects.toThrow(
      'MessagePortWriter experienced a dispatch failure',
    );
    expect(await duplexStream.next()).toStrictEqual(makeDoneResult());
  });

  it('ends the writer when the reader ends', async () => {
    const { port1, port2 } = new MessageChannel();
    const duplexStream = await makeDuplexStream({ port1, port2 });

    const readP = duplexStream.next();
    port2.postMessage(makeStreamDoneSignal());
    await delay(10);
    expect(await duplexStream.write(42)).toStrictEqual(makeDoneResult());
    expect(await readP).toStrictEqual(makeDoneResult());
  });
});
