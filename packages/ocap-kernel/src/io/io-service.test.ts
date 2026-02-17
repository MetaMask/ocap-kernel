import { describe, it, expect, vi } from 'vitest';

import { makeIOService } from './io-service.ts';
import type { IOChannel } from './types.ts';
import type { IOConfig } from '../types.ts';

const makeChannel = (): IOChannel => ({
  read: vi.fn().mockResolvedValue('hello'),
  write: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
});

const makeConfig = (overrides: Partial<IOConfig> = {}): IOConfig =>
  ({
    type: 'socket',
    path: '/tmp/test.sock',
    ...overrides,
  }) as IOConfig;

describe('makeIOService', () => {
  describe('read()', () => {
    it('delegates to the channel', async () => {
      const channel = makeChannel();
      const service = makeIOService(
        'test',
        'subclusterFoo',
        channel,
        makeConfig(),
      ) as {
        read: () => Promise<string | null>;
      };

      const result = await service.read();

      expect(result).toBe('hello');
      expect(channel.read).toHaveBeenCalledOnce();
    });

    it('throws on write-only channel', async () => {
      const channel = makeChannel();
      const service = makeIOService(
        'test',
        'subclusterFoo',
        channel,
        makeConfig({ direction: 'out' }),
      ) as { read: () => Promise<string | null> };

      await expect(service.read()).rejects.toThrow(
        'IO channel "test" is write-only',
      );
      expect(channel.read).not.toHaveBeenCalled();
    });

    it.each(['in', 'inout'] as const)(
      'allows read on direction=%s',
      async (direction) => {
        const channel = makeChannel();
        const service = makeIOService(
          'test',
          'subclusterFoo',
          channel,
          makeConfig({ direction }),
        ) as { read: () => Promise<string | null> };

        expect(await service.read()).toBe('hello');
      },
    );
  });

  describe('write()', () => {
    it('delegates to the channel', async () => {
      const channel = makeChannel();
      const service = makeIOService(
        'test',
        'subclusterFoo',
        channel,
        makeConfig(),
      ) as {
        write: (data: string) => Promise<void>;
      };

      await service.write('world');

      expect(channel.write).toHaveBeenCalledWith('world');
    });

    it('throws on read-only channel', async () => {
      const channel = makeChannel();
      const service = makeIOService(
        'test',
        'subclusterFoo',
        channel,
        makeConfig({ direction: 'in' }),
      ) as { write: (data: string) => Promise<void> };

      await expect(service.write('data')).rejects.toThrow(
        'IO channel "test" is read-only',
      );
      expect(channel.write).not.toHaveBeenCalled();
    });

    it.each(['out', 'inout'] as const)(
      'allows write on direction=%s',
      async (direction) => {
        const channel = makeChannel();
        const service = makeIOService(
          'test',
          'subclusterFoo',
          channel,
          makeConfig({ direction }),
        ) as { write: (data: string) => Promise<void> };

        expect(await service.write('data')).toBeUndefined();
      },
    );
  });

  describe('direction defaults', () => {
    it('defaults to inout when direction is not specified', async () => {
      const channel = makeChannel();
      const service = makeIOService(
        'test',
        'subclusterFoo',
        channel,
        makeConfig(),
      ) as {
        read: () => Promise<string | null>;
        write: (data: string) => Promise<void>;
      };

      expect(await service.read()).toBe('hello');
      expect(await service.write('data')).toBeUndefined();
    });
  });
});
