import { delay } from '@ocap/test-utils';
import { stringify } from '@ocap/utils';
import { describe, expect, it, vi } from 'vitest';

import { BaseDuplexStream, makeAck, makeSyn } from './BaseDuplexStream.js';
import {
  makeDoneResult,
  makePendingResult,
  makeStreamDoneSignal,
} from './utils.js';
import { TestDuplexStream } from '../test/stream-mocks.js';

describe('BaseDuplexStream', () => {
  it('constructs a BaseDuplexStream', () => {
    const duplexStream = new TestDuplexStream(() => undefined);
    expect(duplexStream).toBeInstanceOf(BaseDuplexStream);
    expect(duplexStream[Symbol.asyncIterator]()).toBe(duplexStream);
  });

  describe('synchronization', () => {
    it('writes a SYN message on construction', async () => {
      const onDispatch = vi.fn();
      const stream = new TestDuplexStream(onDispatch);
      stream.synchronize().catch(() => undefined);

      expect(onDispatch).toHaveBeenCalledOnce();
      expect(onDispatch).toHaveBeenCalledWith(makeSyn());
    });

    it('resolves the synchronization promise when receiving an ACK', async () => {
      const duplexStream = new TestDuplexStream(() => undefined);

      await duplexStream.receiveInput(makeAck());
      expect(await duplexStream.completeSynchronization()).toBeUndefined();
    });

    it('writes an ACK message when receiving a SYN', async () => {
      const onDispatch = vi.fn();
      const duplexStream = new TestDuplexStream(onDispatch);
      duplexStream.synchronize().catch((error) => {
        throw error;
      });

      await duplexStream.receiveInput(makeSyn());
      await delay(10);
      expect(onDispatch).toHaveBeenCalledTimes(2);
      expect(onDispatch).toHaveBeenNthCalledWith(2, makeAck());
    });

    it('rejects the synchronization promise if receiving more than one SYN', async () => {
      const duplexStream = new TestDuplexStream(() => undefined);
      duplexStream.synchronize().catch(() => undefined);

      await duplexStream.receiveInput(makeSyn());
      await duplexStream.receiveInput(makeSyn());
      await expect(duplexStream.next()).rejects.toThrow(
        'Received duplicate SYN message during synchronization',
      );
    });

    it('rejects the synchronization promise if receiving an unexpected message', async () => {
      const duplexStream = new TestDuplexStream(() => undefined);
      duplexStream.synchronize().catch(() => undefined);

      await duplexStream.receiveInput(42);
      await expect(duplexStream.next()).rejects.toThrow(
        `Received unexpected message during synchronization: ${stringify({
          done: false,
          value: 42,
        })}`,
      );
    });

    it('synchronization errors causes reads to always throw', async () => {
      const duplexStream = new TestDuplexStream(() => undefined);
      duplexStream.synchronize().catch(() => undefined);

      await duplexStream.receiveInput(makeSyn());
      await duplexStream.receiveInput(makeSyn());
      await expect(duplexStream.next()).rejects.toThrow(
        'Received duplicate SYN message during synchronization',
      );
      await expect(duplexStream.next()).rejects.toThrow(
        'Received duplicate SYN message during synchronization',
      );
    });

    it('synchronization errors causes writes to always throw', async () => {
      const duplexStream = new TestDuplexStream(() => undefined);
      duplexStream.synchronize().catch(() => undefined);

      await duplexStream.receiveInput(makeSyn());
      await duplexStream.receiveInput(makeSyn());
      await expect(duplexStream.write(42)).rejects.toThrow(
        'Received duplicate SYN message during synchronization',
      );
      await expect(duplexStream.write(42)).rejects.toThrow(
        'Received duplicate SYN message during synchronization',
      );
    });

    describe('idempotence', () => {
      it('repeated calls do not affect a pending synchronization', async () => {
        const onDispatch = vi.fn();
        const stream = new TestDuplexStream(onDispatch);

        // Begin synchronization
        stream.synchronize().catch(() => undefined);

        expect(onDispatch).toHaveBeenCalledOnce();
        expect(onDispatch).toHaveBeenCalledWith(makeSyn());

        // Repeat the call
        stream.synchronize().catch(() => undefined);
        await delay(10);

        expect(onDispatch).toHaveBeenCalledOnce();

        // Complete the synchronization, again repeating the call
        await stream.completeSynchronization();

        expect(onDispatch).toHaveBeenCalledOnce();
      });

      it('repeated calls after successful synchronization do nothing', async () => {
        const onDispatch = vi.fn();
        const stream = new TestDuplexStream(onDispatch);

        // Begin and complete synchronization
        await stream.completeSynchronization();

        expect(onDispatch).toHaveBeenCalledOnce();
        expect(onDispatch).toHaveBeenCalledWith(makeSyn());

        // Repeat the call
        await stream.synchronize();

        expect(onDispatch).toHaveBeenCalledOnce();
      });

      it('repeated calls after failed synchronization re-throw the error', async () => {
        const stream = new TestDuplexStream(() => {
          throw new Error('foo');
        });

        await expect(stream.synchronize()).rejects.toThrow('foo');
        await expect(stream.synchronize()).rejects.toThrow('foo');
      });
    });
  });

  it('reads from the reader', async () => {
    const duplexStream = await TestDuplexStream.make(() => undefined);

    const message = 42;
    await duplexStream.receiveInput(message);

    expect(await duplexStream.next()).toStrictEqual(makePendingResult(message));
  });

  it('reads from the reader before synchronization', async () => {
    const duplexStream = new TestDuplexStream(() => undefined);
    const nextP = duplexStream.next();

    await duplexStream.completeSynchronization();

    await duplexStream.receiveInput(42);
    expect(await nextP).toStrictEqual(makePendingResult(42));
  });

  it('reads from the reader, with input validation', async () => {
    const duplexStream = await TestDuplexStream.make(() => undefined, {
      validateInput: (value: unknown): value is number =>
        typeof value === 'number',
    });

    await duplexStream.receiveInput(42);
    expect(await duplexStream.next()).toStrictEqual(makePendingResult(42));
  });

  it('drains the reader in order', async () => {
    const duplexStream = await TestDuplexStream.make(() => undefined);

    const messages = [1, 2, 3];
    await Promise.all(
      messages.map(async (message) => duplexStream.receiveInput(message)),
    );
    await duplexStream.return();

    let index = 0;
    const drainFn = vi.fn((value: number) => {
      expect(value).toStrictEqual(messages[index]);
      index += 1;
    });

    await duplexStream.drain(drainFn);
    expect(drainFn).toHaveBeenCalledTimes(messages.length);
    expect(drainFn).toHaveBeenNthCalledWith(1, 1);
    expect(drainFn).toHaveBeenNthCalledWith(2, 2);
    expect(drainFn).toHaveBeenNthCalledWith(3, 3);
  });

  it('writes to the writer', async () => {
    const onDispatch = vi.fn();
    const duplexStream = await TestDuplexStream.make(onDispatch);

    const message = 42;
    await duplexStream.write(message);
    expect(onDispatch).toHaveBeenCalledWith(message);
  });

  it('writes to the writer before synchronization', async () => {
    const onDispatch = vi.fn();
    const duplexStream = new TestDuplexStream(onDispatch);

    const message = 42;
    duplexStream.write(message).catch(() => undefined);

    expect(onDispatch).not.toHaveBeenCalled();

    await duplexStream.completeSynchronization();

    expect(onDispatch).toHaveBeenCalledWith(message);
  });

  it('return calls ends both the reader and writer', async () => {
    const readerOnEnd = vi.fn();
    const writerOnEnd = vi.fn();
    const duplexStream = await TestDuplexStream.make(() => undefined, {
      readerOnEnd,
      writerOnEnd,
    });

    await duplexStream.return();
    expect(readerOnEnd).toHaveBeenCalledOnce();
    expect(writerOnEnd).toHaveBeenCalledOnce();
  });

  it('throw calls throw on the writer but return on the reader', async () => {
    const readerOnEnd = vi.fn();
    const writerOnEnd = vi.fn();
    const duplexStream = await TestDuplexStream.make(() => undefined, {
      readerOnEnd,
      writerOnEnd,
    });

    await duplexStream.throw(new Error('foo'));
    expect(readerOnEnd).toHaveBeenCalledOnce();
    expect(writerOnEnd).toHaveBeenCalledOnce();
  });

  it('ending the reader calls reader onEnd function', async () => {
    const readerOnEnd = vi.fn();
    const duplexStream = await TestDuplexStream.make(() => undefined, {
      readerOnEnd,
    });

    await duplexStream.receiveInput(makeStreamDoneSignal());
    expect(readerOnEnd).toHaveBeenCalledOnce();
  });

  it('ending the writer calls writer onEnd function', async () => {
    const onDispatch = vi.fn(() => {
      throw new Error('foo');
    });
    const writerOnEnd = vi.fn();
    const duplexStream = await TestDuplexStream.make(onDispatch, {
      writerOnEnd,
    });

    await expect(duplexStream.write(42)).rejects.toThrow('foo');
    expect(writerOnEnd).toHaveBeenCalledOnce();
  });

  describe('end', () => {
    it('calls return() if no error is provided', async () => {
      const duplexStream = await TestDuplexStream.make(() => undefined);
      const nextP = duplexStream.next();
      expect(await duplexStream.end()).toStrictEqual(makeDoneResult());
      expect(await nextP).toStrictEqual(makeDoneResult());
    });

    it('calls throw() if an error is provided', async () => {
      const duplexStream = await TestDuplexStream.make(() => undefined);
      const nextP = duplexStream.next();
      expect(await duplexStream.end(new Error('foo'))).toStrictEqual(
        makeDoneResult(),
      );
      await expect(nextP).rejects.toThrow('foo');
    });
  });
});
