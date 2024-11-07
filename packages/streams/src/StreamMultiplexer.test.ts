import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { ValidateInput } from './BaseStream.js';
import { StreamMultiplexer } from './StreamMultiplexer.js';
import type { MultiplexEnvelope } from './StreamMultiplexer.js';
import { makeDoneResult } from './utils.js';
import { TestDuplexStream, TestMultiplexer } from '../test/stream-mocks.js';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

const isString: ValidateInput<string> = (value) => typeof value === 'string';

const isNumber: ValidateInput<number> = (value) => typeof value === 'number';

const makeEnvelope = (
  channel: string,
  payload: unknown,
): MultiplexEnvelope => ({
  channel,
  payload,
});

const noop = (_value: unknown): void => undefined;

describe('StreamMultiplexer', () => {
  it('constructs a StreamMultiplexer', () => {
    const duplex = new TestDuplexStream<MultiplexEnvelope, MultiplexEnvelope>(
      () => undefined,
    );
    const multiplex = new TestMultiplexer(duplex);
    expect(multiplex).toBeInstanceOf(StreamMultiplexer);
  });

  describe('addChannel', () => {
    it('makes and adds channels', async () => {
      const [multiplex] = await TestMultiplexer.make();
      const ch1 = multiplex.addChannel('1', noop, isString);
      const ch2 = multiplex.addChannel('2', noop, isNumber);
      expect(ch1[Symbol.asyncIterator]()).toBe(ch1);
      expect(ch2[Symbol.asyncIterator]()).toBe(ch2);
    });

    it('throws if adding a channel with the same name multiple times', async () => {
      const [multiplex] = await TestMultiplexer.make();
      multiplex.addChannel('1', noop, isString);
      expect(() => multiplex.addChannel('1', noop, isString)).toThrow(
        'Channel "1" already exists',
      );
    });

    it('throws if adding channels after starting', async () => {
      const [multiplex, duplex] = await TestMultiplexer.make();
      multiplex.addChannel('1', noop, isString);
      const startP = multiplex.start();

      expect(() => multiplex.addChannel('2', noop, isNumber)).toThrow(
        'Channels must be added before starting the multiplexer',
      );

      await Promise.all([startP, duplex.return()]);
    });

    it('throws if adding channels after ending', async () => {
      const [multiplex, duplex] = await TestMultiplexer.make();
      // Add one channel so we can start the multiplexer.
      multiplex.addChannel('1', noop, isString);

      await Promise.all([multiplex.drainAll(), duplex.return()]);

      expect(() => multiplex.addChannel('2', noop, isNumber)).toThrow(
        'Channels must be added before starting',
      );
    });
  });

  describe('start', () => {
    it('is idempotent', async () => {
      const [multiplex, duplex] = await TestMultiplexer.make();
      // Add one channel so we can start the multiplexer.
      multiplex.addChannel('1', noop, isString);
      const startP = Promise.all([multiplex.start(), multiplex.start()]).then(
        () => undefined,
      );
      await duplex.return();
      expect(await startP).toBeUndefined();
    });

    it('enables draining channels separately', async () => {
      const [multiplex, duplex] = await TestMultiplexer.make();
      const ch1Handler = vi.fn();
      const ch2Handler = vi.fn();
      const ch1 = multiplex.addChannel('1', ch1Handler, isString);
      const ch2 = multiplex.addChannel('2', ch2Handler, isNumber);

      const startAndDrainP = Promise.all([
        multiplex.start(),
        ch1.drain(),
        ch2.drain(),
      ]);

      await Promise.all([
        duplex.receiveInput(makeEnvelope('1', 'foo')),
        duplex.receiveInput(makeEnvelope('2', 42)),
      ]);

      await delay(10);

      await duplex.return();
      await startAndDrainP;

      expect(ch1Handler).toHaveBeenCalledWith('foo');
      expect(ch2Handler).toHaveBeenCalledWith(42);
    });
  });

  describe('drainAll', () => {
    it('throws if draining when there are no channels', async () => {
      const [multiplex] = await TestMultiplexer.make();
      await expect(multiplex.drainAll()).rejects.toThrow(
        'TestMultiplexer has no channels',
      );
    });

    it('forwards input to the correct channel', async () => {
      const [multiplex, duplex] = await TestMultiplexer.make();
      const ch1Handler = vi.fn();
      const ch2Handler = vi.fn();
      multiplex.addChannel('1', ch1Handler, isString);
      multiplex.addChannel('2', ch2Handler, isNumber);
      const drainP = multiplex.drainAll();

      await Promise.all([
        duplex.receiveInput(makeEnvelope('1', 'foo')),
        duplex.receiveInput(makeEnvelope('2', 42)),
      ]);

      await delay(10);

      expect(ch1Handler).toHaveBeenCalledWith('foo');
      expect(ch2Handler).toHaveBeenCalledWith(42);

      await duplex.return();
      await drainP;
    });

    it('ends all streams when the duplex stream returns', async () => {
      const [multiplex, duplex] = await TestMultiplexer.make();
      const ch1 = multiplex.addChannel('1', noop, isString);
      const ch2 = multiplex.addChannel('2', noop, isNumber);
      const drainP = multiplex.drainAll();

      await duplex.return();

      expect(await duplex.next()).toStrictEqual(makeDoneResult());
      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
      expect(await drainP).toBeUndefined();
    });

    it('ends all streams when any channel returns', async () => {
      const [multiplex, duplex] = await TestMultiplexer.make();
      const ch1 = multiplex.addChannel('1', noop, isString);
      const ch2 = multiplex.addChannel('2', noop, isNumber);
      const drainP = multiplex.drainAll();

      await ch1.return();

      expect(await duplex.next()).toStrictEqual(makeDoneResult());
      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
      expect(await drainP).toBeUndefined();
    });

    it('ends all streams when the duplex stream throws', async () => {
      const onDispatch = vi.fn();
      const [multiplex] = await TestMultiplexer.make(
        await TestDuplexStream.make(onDispatch),
      );
      const ch1 = multiplex.addChannel('1', noop, isString);
      const ch2 = multiplex.addChannel('2', noop, isNumber);
      onDispatch.mockImplementationOnce(() => {
        throw new Error('foo');
      });

      const drainP = multiplex.drainAll();

      await expect(ch1.write('foo')).rejects.toThrow(
        'TestDuplexStream experienced a dispatch failure',
      );

      await expect(drainP).rejects.toThrow(
        'TestDuplexStream experienced a dispatch failure',
      );
      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
    });

    it('ends all streams when a channel throws', async () => {
      const [multiplex, duplex] = await TestMultiplexer.make();
      const ch1 = multiplex.addChannel('1', noop, isString);
      const ch2 = multiplex.addChannel('2', noop, isNumber);

      const drainP = multiplex.drainAll();

      await duplex.receiveInput(makeEnvelope('1', 42));

      await expect(drainP).rejects.toThrow(
        'TestMultiplexer#1: Message failed type validation',
      );
      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
    });

    it('ends all streams when receiving a message for a non-existent channel', async () => {
      const [multiplex, duplex] = await TestMultiplexer.make();
      const ch1 = multiplex.addChannel('1', noop, isString);
      const ch2 = multiplex.addChannel('2', noop, isNumber);

      const drainP = multiplex.drainAll();

      // There is no channel 3
      await duplex.receiveInput(makeEnvelope('3', 42));

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
      const [multiplex] = await TestMultiplexer.make(duplex);
      const ch1 = multiplex.addChannel('1', noop, isString);
      const ch2 = multiplex.addChannel('2', noop, isNumber);

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
    });

    it('returns done results from channel writes after ending', async () => {
      const [multiplex, duplex] = await TestMultiplexer.make();
      const ch1 = multiplex.addChannel('1', noop, isString);
      const ch2 = multiplex.addChannel('2', noop, isNumber);

      await Promise.all([multiplex.drainAll(), duplex.return()]);

      expect(await ch1.write('foo')).toStrictEqual(makeDoneResult());
      expect(await ch2.write(42)).toStrictEqual(makeDoneResult());
    });
  });

  describe('return', () => {
    it('ends the multiplexer and its channels', async () => {
      const [multiplex] = await TestMultiplexer.make();
      const ch1 = multiplex.addChannel('1', noop, isString);
      const ch2 = multiplex.addChannel('2', noop, isNumber);

      await multiplex.return();

      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
    });

    it('is idempotent', async () => {
      const [multiplex] = await TestMultiplexer.make();
      const ch1 = multiplex.addChannel('1', noop, isString);
      const ch2 = multiplex.addChannel('2', noop, isNumber);

      await multiplex.return();

      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());

      await multiplex.return();

      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
    });
  });
});
