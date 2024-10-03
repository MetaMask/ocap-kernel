import type { Json } from '@metamask/utils';
import {
  delay,
  makeErrorMatcherFactory,
  makePromiseKitMock,
} from '@ocap/test-utils';
import { describe, expect, it, vi } from 'vitest';

import {
  makeMessagePortStreamPair,
  MessagePortReader,
  MessagePortWriter,
} from './MessagePortStream.js';
import { makeDoneResult, makePendingResult } from './utils.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

const makeErrorMatcher = makeErrorMatcherFactory(expect);

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

    await expect(remoteReadP).rejects.toThrow(makeErrorMatcher('foo'));
    expect(port2.onmessage).toBeNull();
  });
});
