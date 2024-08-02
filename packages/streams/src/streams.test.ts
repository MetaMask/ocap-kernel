import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { MessagePortReader, MessagePortWriter } from './streams';

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

    await expect(reader.next()).resolves.toEqual({
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

    await expect(nextP).resolves.toEqual({ done: false, value: message });
  });

  it('iterates over multiple port messages', async () => {
    const { port1, port2 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    const messages = [{ foo: 'bar' }, { bar: 'baz' }, { baz: 'qux' }];
    messages.forEach((message) => port2.postMessage(message));

    for (const message of messages) {
      await expect(reader.next()).resolves.toEqual({
        done: false,
        value: message,
      });
    }
  });

  it('ends after returning', async () => {
    const { port1 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    const result = reader.return();
    await expect(result).resolves.toEqual({ done: true, value: undefined });
    expect(port1.onmessage).toBe(null);
  });

  it('resolves pending promises after returning', async () => {
    const { port1 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    const nextP = reader.next();
    const returnP = reader.return();

    await expect(nextP).resolves.toEqual({ done: true, value: undefined });
    await expect(returnP).resolves.toEqual({ done: true, value: undefined });
  });

  it('ends after throwing', async () => {
    const { port1 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    const result = reader.throw(new Error());
    await expect(result).resolves.toEqual({ done: true, value: undefined });
    expect(port1.onmessage).toBe(null);
  });

  it('rejects pending promises after throwing', async () => {
    const { port1 } = new MessageChannel();
    const reader = new MessagePortReader(port1);

    const nextP = reader.next();
    const returnP = reader.throw(new Error('end'));

    await expect(nextP).rejects.toThrow('end');
    await expect(returnP).resolves.toEqual({ done: true, value: undefined });
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

    await expect(nextP).resolves.toEqual({ done: false, value: undefined });
    await expect(messageP).resolves.toEqual(message);
  });

  it('ends after returning', async () => {
    const { port1 } = new MessageChannel();
    const writer = new MessagePortWriter(port1);

    const result = writer.return();
    await expect(result).resolves.toEqual({ done: true, value: undefined });
    expect(port1.onmessage).toBe(null);
  });

  it('ends after throwing', async () => {
    const { port1 } = new MessageChannel();
    const writer = new MessagePortWriter(port1);

    const result = writer.throw();
    await expect(result).resolves.toEqual({ done: true, value: undefined });
    expect(port1.onmessage).toBe(null);
  });
});
