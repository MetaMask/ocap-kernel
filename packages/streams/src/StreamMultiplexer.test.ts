import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { makeAck, makeSyn } from './BaseDuplexStream.js';
import type { ValidateInput } from './BaseStream.js';
import { StreamMultiplexer } from './StreamMultiplexer.js';
import type { MultiplexEnvelope } from './StreamMultiplexer.js';
import { makeDoneResult } from './utils.js';
import {
  makeMultiplexEnvelope as makeEnvelope,
  TestDuplexStream,
  TestMultiplexer,
} from '../test/stream-mocks.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

const isString: ValidateInput<string> = (value) => typeof value === 'string';

const isNumber: ValidateInput<number> = (value) => typeof value === 'number';

const noop = (_value: unknown): void => undefined;

describe('StreamMultiplexer', () => {
  it('constructs a StreamMultiplexer', () => {
    const duplex = new TestDuplexStream<MultiplexEnvelope, MultiplexEnvelope>(
      () => undefined,
    );
    const multiplex = new TestMultiplexer(duplex);
    expect(multiplex).toBeInstanceOf(StreamMultiplexer);
  });

  describe('createChannel', () => {
    it('makes and adds channels', async () => {
      const multiplex = await TestMultiplexer.make();
      const ch1 = multiplex.createChannel('1', isString);
      const ch2 = multiplex.createChannel('2', isNumber);
      expect(ch1[Symbol.asyncIterator]()).toBe(ch1);
      expect(ch2[Symbol.asyncIterator]()).toBe(ch2);
    });

    it('makes and adds channels after starting', async () => {
      const multiplex = await TestMultiplexer.make();
      const startP = multiplex.start();
      const ch1 = multiplex.createChannel('1', isString);
      const ch2 = multiplex.createChannel('2', isNumber);
      expect(ch1[Symbol.asyncIterator]()).toBe(ch1);
      expect(ch2[Symbol.asyncIterator]()).toBe(ch2);

      await multiplex.return();
      await startP;
    });

    it('throws if adding a channel with the same name multiple times', async () => {
      const multiplex = await TestMultiplexer.make();
      multiplex.createChannel('1', isString);
      expect(() => multiplex.createChannel('1', isString)).toThrow(
        'Channel "1" already exists',
      );
    });

    it('throws if adding channels after ending', async () => {
      const multiplex = await TestMultiplexer.make();
      // Add one channel so we can start the multiplexer.
      multiplex.createChannel('1', isString);

      await Promise.all([multiplex.start(), multiplex.duplex.return()]);

      expect(() => multiplex.createChannel('2', isNumber)).toThrow(
        'Multiplexer has ended',
      );
    });

    it('causes the multiplexer to throw if synchronizing the channels fails', async () => {
      const multiplex = await TestMultiplexer.make();
      multiplex.createChannel('1', isString);
      const startP = multiplex.start();
      await multiplex.duplex.receiveInput(makeEnvelope('1', makeSyn()));
      await multiplex.duplex.receiveInput(makeEnvelope('1', makeSyn()));
      await expect(startP).rejects.toThrow(
        'Received duplicate SYN message during synchronization',
      );
    });
  });

  describe('start', () => {
    it('is idempotent', async () => {
      const multiplex = await TestMultiplexer.make();
      // Add one channel so we can start the multiplexer.
      multiplex.createChannel('1', isString);
      const startP = Promise.all([multiplex.start(), multiplex.start()]).then(
        () => undefined,
      );
      await multiplex.duplex.return();
      expect(await startP).toBeUndefined();
    });

    it('enables draining channels separately', async () => {
      const multiplex = await TestMultiplexer.make();
      const ch1Handler = vi.fn();
      const ch2Handler = vi.fn();
      const ch1 = multiplex.createChannel('1', isString);
      const ch2 = multiplex.createChannel('2', isNumber);

      const startAndDrainP = Promise.all([
        multiplex.start(),
        ch1.drain(ch1Handler),
        ch2.drain(ch2Handler),
      ]);

      await Promise.all([
        multiplex.synchronizeChannels('1', '2'),
        multiplex.duplex.receiveInput(makeEnvelope('1', 'foo')),
        multiplex.duplex.receiveInput(makeEnvelope('2', 42)),
      ]);

      await delay(10);
      await multiplex.duplex.return();
      await startAndDrainP;

      expect(ch1Handler).toHaveBeenCalledWith('foo');
      expect(ch2Handler).toHaveBeenCalledWith(42);
    });
  });

  describe('reading', () => {
    it('forwards input to the correct channel', async () => {
      const multiplex = await TestMultiplexer.make();
      const ch1Handler = vi.fn();
      const ch2Handler = vi.fn();
      const ch1 = multiplex.createChannel('1', isString);
      const ch2 = multiplex.createChannel('2', isNumber);
      const drainP = Promise.all([
        multiplex.start(),
        ch1.drain(ch1Handler),
        ch2.drain(ch2Handler),
      ]);

      await Promise.all([
        multiplex.synchronizeChannels('1', '2'),
        multiplex.duplex.receiveInput(makeEnvelope('1', 'foo')),
        multiplex.duplex.receiveInput(makeEnvelope('2', 42)),
      ]);

      await delay(10);

      expect(ch1Handler).toHaveBeenCalledWith('foo');
      expect(ch2Handler).toHaveBeenCalledWith(42);

      await multiplex.return();
      await drainP;
    });

    it('ignores SYN messages for unknown channels', async () => {
      const multiplex = await TestMultiplexer.make();
      const ch1Handler = vi.fn();
      const ch1 = multiplex.createChannel('1', isString);
      const drainP = Promise.all([multiplex.start(), ch1.drain(ch1Handler)]);

      await Promise.all([
        multiplex.synchronizeChannels('1'),
        multiplex.duplex.receiveInput(makeEnvelope('2', makeSyn())),
        multiplex.duplex.receiveInput(makeEnvelope('1', 'foo')),
      ]);

      await delay(10);

      expect(ch1Handler).toHaveBeenCalledWith('foo');

      await multiplex.return();
      await drainP;
    });

    it('ends all streams when the duplex stream returns', async () => {
      const multiplex = await TestMultiplexer.make();
      const ch1 = multiplex.createChannel('1', isString);
      const ch2 = multiplex.createChannel('2', isNumber);
      const drainP = Promise.all([
        multiplex.start(),
        ch1.drain(noop),
        ch2.drain(noop),
      ]);

      await multiplex.synchronizeChannels('1', '2');
      await delay(10);
      await multiplex.duplex.return();

      expect(await multiplex.duplex.next()).toStrictEqual(makeDoneResult());
      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());

      await drainP;
    });

    it('ends all streams when any channel returns', async () => {
      const multiplex = await TestMultiplexer.make();
      const ch1 = multiplex.createChannel('1', isString);
      const ch2 = multiplex.createChannel('2', isNumber);
      const drainP = Promise.all([
        multiplex.start(),
        ch1.drain(noop),
        ch2.drain(noop),
      ]);

      await ch1.return();

      expect(await multiplex.duplex.next()).toStrictEqual(makeDoneResult());
      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());

      await drainP;
    });

    it('throws and ends all streams when the duplex stream throws', async () => {
      const onDispatch = vi.fn();
      const multiplex = await TestMultiplexer.make(
        await TestDuplexStream.make(onDispatch),
      );
      const ch1 = multiplex.createChannel('1', isString);
      const ch2 = multiplex.createChannel('2', isNumber);

      await multiplex.synchronizeChannels('1', '2');
      const drainP = Promise.all([
        multiplex.start(),
        ch1.drain(noop),
        ch2.drain(noop),
      ]);
      await delay(10);

      onDispatch.mockImplementationOnce(() => {
        throw new Error('foo');
      });

      await expect(ch1.write('foo')).rejects.toThrow(
        'TestMultiplexer#1 experienced a dispatch failure',
      );

      await expect(drainP).rejects.toThrow(
        'TestDuplexStream experienced a dispatch failure',
      );
      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
    });

    it('throws and ends all streams when a channel throws', async () => {
      const multiplex = await TestMultiplexer.make();
      const ch1 = multiplex.createChannel('1', isString);
      const ch2 = multiplex.createChannel('2', isNumber);

      const drainP = Promise.all([
        multiplex.start(),
        ch1.drain(noop),
        ch2.drain(noop),
      ]);

      await multiplex.synchronizeChannels('1', '2');
      await multiplex.duplex.receiveInput(makeEnvelope('1', 42));

      await expect(drainP).rejects.toThrow(
        'TestMultiplexer#1: Message failed type validation',
      );
      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
    });

    it('throws and ends all streams when receiving a message for a non-existent channel', async () => {
      const multiplex = await TestMultiplexer.make();
      const ch1 = multiplex.createChannel('1', isString);
      const ch2 = multiplex.createChannel('2', isNumber);

      await multiplex.synchronizeChannels('1', '2');
      const drainP = Promise.all([
        multiplex.start(),
        ch1.drain(noop),
        ch2.drain(noop),
      ]);

      // There is no channel 3
      await multiplex.duplex.receiveInput(makeEnvelope('3', 42));

      await expect(drainP).rejects.toThrow(
        'TestMultiplexer received message for unknown channel: 3',
      );
      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
    });
  });

  describe('writing', () => {
    it('writes channel messages correctly', async () => {
      const dispatch = vi.fn();
      const duplex = await TestDuplexStream.make<
        MultiplexEnvelope,
        MultiplexEnvelope
      >(dispatch);
      const multiplex = await TestMultiplexer.make(duplex);
      const ch1 = multiplex.createChannel('1', isString);
      const ch2 = multiplex.createChannel('2', isNumber);

      const startP = multiplex.start();

      await duplex.receiveInput(makeEnvelope('1', makeAck()));
      await duplex.receiveInput(makeEnvelope('2', makeAck()));

      await ch1.write('foo');
      await ch2.write(42);

      expect(dispatch).toHaveBeenCalledWith({
        channel: '1',
        payload: 'foo',
      });
      expect(dispatch).toHaveBeenLastCalledWith({
        channel: '2',
        payload: 42,
      });

      await multiplex.return();
      await startP;
    });

    it('returns done results from channel writes after ending', async () => {
      const multiplex = await TestMultiplexer.make();
      const ch1 = multiplex.createChannel('1', isString);
      const ch2 = multiplex.createChannel('2', isNumber);

      await Promise.all([
        multiplex.start(),
        ch1.drain(noop),
        ch2.drain(noop),
        multiplex.return(),
      ]);

      expect(await ch1.write('foo')).toStrictEqual(makeDoneResult());
      expect(await ch2.write(42)).toStrictEqual(makeDoneResult());
    });
  });

  describe('return', () => {
    it('ends the multiplexer and its channels', async () => {
      const multiplex = await TestMultiplexer.make();
      const ch1 = multiplex.createChannel('1', isString);
      const ch2 = multiplex.createChannel('2', isNumber);

      await multiplex.return();

      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const multiplex = await TestMultiplexer.make();
      const ch1 = multiplex.createChannel('1', isString);
      const ch2 = multiplex.createChannel('2', isNumber);

      await multiplex.return();

      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());

      await multiplex.return();

      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
    });
  });
});
