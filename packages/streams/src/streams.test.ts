import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { MessagePortReader, MessagePortWriter } from './streams.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

describe.concurrent('MessagePortReader', () => {
  it('constructs a MessagePortReader', () => {
    const { port1 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    expect(reader).toBeInstanceOf(MessagePortReader);
    expect(reader[Symbol.asyncIterator]()).toBe(reader);
    expect(port1.onmessage).toBeInstanceOf(Function);
  });

  it('emits message port message received before next()', async () => {
    const { port1, port2 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    const message = { foo: 'bar' };
    port2.postMessage(message);
    await delay(100);

    expect(await reader.next()).toStrictEqual({
      done: false,
      value: message,
    });
  });

  it('emits message port message received after next()', async () => {
    const { port1, port2 } = new MessageChannel();
    const reader = new MessagePortReader(port1);
    const nextP = reader.next();

    const message = { foo: 'bar' };
    port2.postMessage(message);

    expect(await nextP).toStrictEqual({ done: false, value: message });
  });

  it('iterates over multiple port messages', async () => {
    const { port1, port2 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    const messages = [{ foo: 'bar' }, { bar: 'baz' }, { baz: 'qux' }];
    messages.forEach((message) => port2.postMessage(message));

    for (const message of messages) {
      expect(await reader.next()).toStrictEqual({
        done: false,
        value: message,
      });
    }
  });

  it('ends after returning', async () => {
    const { port1 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    const result = reader.return();
    expect(await result).toStrictEqual({
      done: true,
      value: undefined,
    });
    expect(port1.onmessage).toBeNull();
  });

  it('resolves pending promises after returning', async () => {
    const { port1 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    const nextP = reader.next();
    const returnP = reader.return();

    expect(await nextP).toStrictEqual({
      done: true,
      value: undefined,
    });
    expect(await returnP).toStrictEqual({
      done: true,
      value: undefined,
    });
  });

  it('ends after throwing', async () => {
    const { port1 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    const result = reader.throw();
    expect(await result).toStrictEqual({
      done: true,
      value: undefined,
    });
    expect(port1.onmessage).toBeNull();
  });

  it('resolves pending promises after throwing', async () => {
    const { port1 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    const nextP = reader.next();
    const returnP = reader.throw();

    expect(await nextP).toStrictEqual({
      done: true,
      value: undefined,
    });
    expect(await returnP).toStrictEqual({
      done: true,
      value: undefined,
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

  it('posts messages to the port', async () => {
    const { port1, port2 } = new MessageChannel();
    const writer = new MessagePortWriter(port1);

    const message = { foo: 'bar' };
    const messageP = new Promise((resolve) => {
      port2.onmessage = (messageEvent) => resolve(messageEvent.data);
    });
    const nextP = writer.next(message);

    expect(await nextP).toStrictEqual({
      done: false,
      value: undefined,
    });
    expect(await messageP).toStrictEqual(message);
  });

  it('ends after returning', async () => {
    const { port1 } = new MessageChannel();
    const writer = new MessagePortWriter(port1);

    const result = writer.return();
    expect(await result).toStrictEqual({
      done: true,
      value: undefined,
    });
    expect(port1.onmessage).toBeNull();
  });

  it('ends after throwing', async () => {
    const { port1 } = new MessageChannel();
    const writer = new MessagePortWriter(port1);

    const result = writer.throw();
    expect(await result).toStrictEqual({
      done: true,
      value: undefined,
    });
    expect(port1.onmessage).toBeNull();
  });
});
