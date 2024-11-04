import type { Json } from '@metamask/utils';
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

const makeMultiplexer = async (
  duplex?: TestDuplexStream<MultiplexEnvelope, MultiplexEnvelope>,
): Promise<
  [TestMultiplexer, TestDuplexStream<MultiplexEnvelope, MultiplexEnvelope>]
> => {
  // We can't use the async factory for a parameter default
  // eslint-disable-next-line no-param-reassign
  duplex ??= await TestDuplexStream.make<MultiplexEnvelope, MultiplexEnvelope>(
    () => undefined,
  );
  return [new TestMultiplexer(duplex), duplex];
};

const makeEnvelope = (channel: string, payload: Json): MultiplexEnvelope => ({
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
      const [multiplex] = await makeMultiplexer();
      const ch1 = multiplex.addChannel('1', isString, noop);
      const ch2 = multiplex.addChannel('2', isNumber, noop);
      expect(ch1[Symbol.asyncIterator]()).toBe(ch1);
      expect(ch2[Symbol.asyncIterator]()).toBe(ch2);
    });

    it('throws if adding a channel with the same name multiple times', async () => {
      const [multiplex] = await makeMultiplexer();
      multiplex.addChannel('1', isString, noop);
      expect(() => multiplex.addChannel('1', isString, noop)).toThrow(
        'Channel "1" already exists',
      );
    });

    it('throws if adding channels after starting', async () => {
      const [multiplex, duplex] = await makeMultiplexer();
      multiplex.addChannel('1', isString, noop);
      const startP = multiplex.start();

      expect(() => multiplex.addChannel('2', isNumber, noop)).toThrow(
        'Channels must be added before starting the multiplexer',
      );

      await Promise.all([startP, duplex.return()]);
    });

    it('throws if adding channels after ending', async () => {
      const [multiplex, duplex] = await makeMultiplexer();
      // Add one channel so we can start the multiplexer.
      multiplex.addChannel('1', isString, noop);

      await Promise.all([multiplex.drainAll(), duplex.return()]);

      expect(() => multiplex.addChannel('2', isNumber, noop)).toThrow(
        'Channels must be added before starting',
      );
    });
  });

  describe('start', () => {
    it('is idempotent', async () => {
      const [multiplex, duplex] = await makeMultiplexer();
      // Add one channel so we can start the multiplexer.
      multiplex.addChannel('1', isString, noop);
      const startP = Promise.all([multiplex.start(), multiplex.start()]).then(
        () => undefined,
      );
      await duplex.return();
      expect(await startP).toBeUndefined();
    });

    it('enables draining channels separately', async () => {
      const [multiplex, duplex] = await makeMultiplexer();
      const ch1Handler = vi.fn();
      const ch2Handler = vi.fn();
      const ch1 = multiplex.addChannel('1', isString, ch1Handler);
      const ch2 = multiplex.addChannel('2', isNumber, ch2Handler);

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
      const [multiplex] = await makeMultiplexer();
      await expect(multiplex.drainAll()).rejects.toThrow(
        'TestMultiplexer has no channels',
      );
    });

    it('forwards input to the correct channel', async () => {
      const [multiplex, duplex] = await makeMultiplexer();
      const ch1Handler = vi.fn();
      const ch2Handler = vi.fn();
      multiplex.addChannel('1', isString, ch1Handler);
      multiplex.addChannel('2', isNumber, ch2Handler);
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
      const [multiplex, duplex] = await makeMultiplexer();
      const ch1 = multiplex.addChannel('1', isString, noop);
      const ch2 = multiplex.addChannel('2', isNumber, noop);
      const drainP = multiplex.drainAll();

      await duplex.return();

      expect(await duplex.next()).toStrictEqual(makeDoneResult());
      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
      expect(await drainP).toBeUndefined();
    });

    it('ends all streams when any channel returns', async () => {
      const [multiplex, duplex] = await makeMultiplexer();
      const ch1 = multiplex.addChannel('1', isString, noop);
      const ch2 = multiplex.addChannel('2', isNumber, noop);
      const drainP = multiplex.drainAll();

      await ch1.return();

      expect(await duplex.next()).toStrictEqual(makeDoneResult());
      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
      expect(await drainP).toBeUndefined();
    });

    it('ends all streams when the duplex stream throws', async () => {
      const onDispatch = vi.fn();
      const [multiplex] = await makeMultiplexer(
        await TestDuplexStream.make(onDispatch),
      );
      const ch1 = multiplex.addChannel('1', isString, noop);
      const ch2 = multiplex.addChannel('2', isNumber, noop);
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
      const [multiplex, duplex] = await makeMultiplexer();
      const ch1 = multiplex.addChannel('1', isString, noop);
      const ch2 = multiplex.addChannel('2', isNumber, noop);

      const drainP = multiplex.drainAll();

      await duplex.receiveInput(makeEnvelope('1', 42));

      await expect(drainP).rejects.toThrow(
        'TestMultiplexer#1: Message failed type validation',
      );
      expect(await ch1.next()).toStrictEqual(makeDoneResult());
      expect(await ch2.next()).toStrictEqual(makeDoneResult());
    });

    it('ends all streams when receiving a message for a non-existent channel', async () => {
      const [multiplex, duplex] = await makeMultiplexer();
      const ch1 = multiplex.addChannel('1', isString, noop);
      const ch2 = multiplex.addChannel('2', isNumber, noop);

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
      const [multiplex, duplex] = await makeMultiplexer();
      const ch1 = multiplex.addChannel('1', isString, noop);
      const ch2 = multiplex.addChannel('2', isNumber, noop);

      const writeSpy = vi.spyOn(duplex, 'write');

      await ch1.write('foo');
      await ch2.write(42);

      expect(writeSpy).toHaveBeenCalledTimes(2);
      expect(writeSpy).toHaveBeenNthCalledWith(1, {
        channel: '1',
        payload: 'foo',
      });
      expect(writeSpy).toHaveBeenNthCalledWith(2, {
        channel: '2',
        payload: 42,
      });
    });

    it('returns done results from channel writes after ending', async () => {
      const [multiplex, duplex] = await makeMultiplexer();
      const ch1 = multiplex.addChannel('1', isString, noop);
      const ch2 = multiplex.addChannel('2', isNumber, noop);

      await Promise.all([multiplex.drainAll(), duplex.return()]);

      expect(await ch1.write('foo')).toStrictEqual(makeDoneResult());
      expect(await ch2.write(42)).toStrictEqual(makeDoneResult());
    });
  });
});
