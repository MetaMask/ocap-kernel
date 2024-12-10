import { delay } from '@ocap/utils';
import { describe, it, expect, vi } from 'vitest';
import type { Mocked } from 'vitest';

import {
  NodeWorkerDuplexStream,
  NodeWorkerMultiplexer,
  NodeWorkerReader,
  NodeWorkerWriter,
} from './NodeWorkerStream.js';
import type { NodePort, OnMessage } from './NodeWorkerStream.js';
import { makeMultiplexEnvelope } from '../../test/stream-mocks.js';
import { makeAck } from '../BaseDuplexStream.js';
import type { ValidateInput } from '../BaseStream.js';
import {
  makeDoneResult,
  makePendingResult,
  makeStreamDoneSignal,
} from '../utils.js';

const makeMockNodePort = (): Mocked<NodePort> & {
  messageHandler?: OnMessage | undefined;
} => {
  const port = {
    on: vi.fn((_event, listener) => {
      port.messageHandler = listener;
    }),
    postMessage: vi.fn(),
    messageHandler: undefined,
  };
  return port;
};

describe('NodeWorkerReader', () => {
  it('constructs a NodeWorkerReader', () => {
    const port = makeMockNodePort();
    const reader = new NodeWorkerReader(port);

    expect(reader).toBeInstanceOf(NodeWorkerReader);
    expect(reader[Symbol.asyncIterator]()).toBe(reader);
    expect(port.on).toHaveBeenCalledOnce();
  });

  it('emits messages received from port', async () => {
    const port = makeMockNodePort();
    const reader = new NodeWorkerReader(port);

    const message = { foo: 'bar' };
    port.messageHandler?.(message);

    expect(await reader.next()).toStrictEqual(makePendingResult(message));
  });

  it('calls validateInput with received input if specified', async () => {
    const port = makeMockNodePort();
    const validateInput = vi
      .fn()
      .mockReturnValue(true) as unknown as ValidateInput<number>;
    const reader = new NodeWorkerReader(port, { validateInput });

    const message = { foo: 'bar' };
    port.messageHandler?.(message);

    expect(await reader.next()).toStrictEqual(makePendingResult(message));
    expect(validateInput).toHaveBeenCalledWith(message);
  });

  it('throws if validateInput throws', async () => {
    const port = makeMockNodePort();
    const validateInput = (() => {
      throw new Error('foo');
    }) as unknown as ValidateInput<number>;
    const reader = new NodeWorkerReader(port, { validateInput });

    port.messageHandler?.(42);
    await expect(reader.next()).rejects.toThrow('foo');
    expect(await reader.next()).toStrictEqual(makeDoneResult());
  });

  it('calls onEnd once when ending', async () => {
    const port = makeMockNodePort();
    const onEnd = vi.fn();
    const reader = new NodeWorkerReader(port, { onEnd });

    port.messageHandler?.(makeStreamDoneSignal());

    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(await reader.next()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('NodeWorkerWriter', () => {
  it('constructs a NodeWorkerWriter', () => {
    const port = makeMockNodePort();
    const writer = new NodeWorkerWriter(port);

    expect(writer).toBeInstanceOf(NodeWorkerWriter);
    expect(writer[Symbol.asyncIterator]()).toBe(writer);
  });

  it('writes messages to the port', async () => {
    const port = makeMockNodePort();
    const writer = new NodeWorkerWriter(port);

    const message = { foo: 'bar' };
    const nextP = writer.next(message);

    expect(await nextP).toStrictEqual(makePendingResult(undefined));
    expect(port.postMessage).toHaveBeenCalledWith(message);
  });

  it('calls onEnd once when ending', async () => {
    const port = makeMockNodePort();
    const onEnd = vi.fn();
    const writer = new NodeWorkerWriter(port, { onEnd });

    expect(await writer.return()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(await writer.return()).toStrictEqual(makeDoneResult());
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('NodeWorkerDuplexStream', () => {
  const makeDuplexStream = async (
    port = makeMockNodePort(),
    validateInput?: ValidateInput<number>,
  ): Promise<NodeWorkerDuplexStream<number>> => {
    const duplexStreamP = NodeWorkerDuplexStream.make<number>(
      port,
      validateInput,
    );
    port.messageHandler?.(makeAck());
    return await duplexStreamP;
  };

  it('constructs a NodeWorkerDuplexStream', async () => {
    const duplexStream = await makeDuplexStream();

    expect(duplexStream).toBeInstanceOf(NodeWorkerDuplexStream);
    expect(duplexStream[Symbol.asyncIterator]()).toBe(duplexStream);
  });

  it('calls validateInput with received input if specified', async () => {
    const validateInput = vi
      .fn()
      .mockReturnValue(true) as unknown as ValidateInput<number>;
    const port = makeMockNodePort();
    const duplexStream = await makeDuplexStream(port, validateInput);

    port.messageHandler?.(42);

    expect(await duplexStream.next()).toStrictEqual(makePendingResult(42));
    expect(validateInput).toHaveBeenCalledWith(42);
  });

  it('ends the reader when the writer ends', async () => {
    const port = makeMockNodePort();
    port.postMessage
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('foo');
      });
    const duplexStream = await makeDuplexStream(port);

    await expect(duplexStream.write(42)).rejects.toThrow(
      'NodeWorkerDuplexStream experienced a dispatch failure',
    );
    expect(await duplexStream.next()).toStrictEqual(makeDoneResult());
  });

  it('ends the writer when the reader ends', async () => {
    const port = makeMockNodePort();
    const duplexStream = await makeDuplexStream(port);

    const readP = duplexStream.next();
    port.messageHandler?.(makeStreamDoneSignal());
    await delay(10);
    expect(await duplexStream.write(42)).toStrictEqual(makeDoneResult());
    expect(await readP).toStrictEqual(makeDoneResult());
  });
});

describe('NodeWorkerMultiplexer', () => {
  it('constructs a NodeWorkerMultiplexer', () => {
    const port = makeMockNodePort();
    const multiplexer = new NodeWorkerMultiplexer(port);

    expect(multiplexer).toBeInstanceOf(NodeWorkerMultiplexer);
  });

  it('can create and drain channels', async () => {
    const port = makeMockNodePort();
    const multiplexer = new NodeWorkerMultiplexer(port);
    const ch1Handler = vi.fn();
    const ch1 = multiplexer.createChannel<number, number>(
      '1',
      (value: unknown): value is number => typeof value === 'number',
    );

    const drainP = Promise.all([multiplexer.start(), ch1.drain(ch1Handler)]);
    port.messageHandler?.(makeAck());
    port.messageHandler?.(makeMultiplexEnvelope('1', makeAck()));
    port.messageHandler?.(makeMultiplexEnvelope('1', 42));
    port.messageHandler?.(makeStreamDoneSignal());

    await drainP;
    expect(ch1Handler).toHaveBeenCalledWith(42);
  });
});
