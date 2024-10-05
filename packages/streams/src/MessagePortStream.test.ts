import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { describe, expect, it, vi } from 'vitest';

import {
  MessagePortDuplexStream,
  MessagePortReader,
  MessagePortWriter,
} from './MessagePortStream.js';
import { makeDoneResult, makePendingResult } from './utils.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

describe('MessagePortReader', () => {
  it('constructs a MessagePortReader', () => {
    const { port1 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    expect(reader).toBeInstanceOf(MessagePortReader);
    expect(reader[Symbol.asyncIterator]()).toBe(reader);
    expect(port1.onmessage).toBeInstanceOf(Function);
  });

  it('emits messages received from port', async () => {
    const { port1, port2 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    const message = { foo: 'bar' };
    port2.postMessage(makePendingResult(message));
    await delay(100);

    expect(await reader.next()).toStrictEqual(makePendingResult(message));
  });

  it('closes the port when done', async () => {
    const { port1, port2 } = new MessageChannel();
    const closeSpy = vi.spyOn(port1, 'close');
    const reader = new MessagePortReader(port1);
    expect(port1.onmessage).toBeDefined();

    port2.postMessage(makeDoneResult());
    await delay(100);

    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(closeSpy).toHaveBeenCalledOnce();
    expect(port1.onmessage).toBeNull();
  });

  it('calls onEnd once when ending', async () => {
    const { port1, port2 } = new MessageChannel();
    const onEnd = vi.fn();
    const reader = new MessagePortReader(port1, onEnd);

    port2.postMessage(makeDoneResult());
    await delay(100);

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
    expect(await messageP).toStrictEqual(makePendingResult(message));
  });

  it('closes the port when it ends', async () => {
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
  it('constructs a MessagePortDuplexStream', () => {
    const { port1 } = new MessageChannel();
    const duplexStream = new MessagePortDuplexStream(port1);

    expect(duplexStream).toBeInstanceOf(MessagePortDuplexStream);
    expect(duplexStream.reader).toBeInstanceOf(MessagePortReader);
    expect(duplexStream.writer).toBeInstanceOf(MessagePortWriter);
  });

  it('ends the reader when the writer ends', async () => {
    const { port1 } = new MessageChannel();
    const duplexStream = new MessagePortDuplexStream(port1);

    await duplexStream.writer.return();
    expect(await duplexStream.reader.next()).toStrictEqual(makeDoneResult());
  });

  it('ends the writer when the reader ends', async () => {
    const { port1 } = new MessageChannel();
    const duplexStream = new MessagePortDuplexStream(port1);

    await duplexStream.reader.return();
    expect(await duplexStream.writer.next(null)).toStrictEqual(
      makeDoneResult(),
    );
  });
});
