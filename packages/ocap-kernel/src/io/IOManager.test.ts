import { Logger } from '@metamask/logger';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { IOManager } from './IOManager.ts';
import type { IOChannel, IOChannelFactory } from './types.ts';
import type { KernelService } from '../KernelServiceManager.ts';
import type { IOConfig } from '../types.ts';

const makeChannel = (): IOChannel => ({
  read: vi.fn().mockResolvedValue('data'),
  write: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
});

describe('IOManager', () => {
  let factory: IOChannelFactory;
  let registerService: ReturnType<typeof vi.fn>;
  let unregisterService: ReturnType<typeof vi.fn>;
  let logger: Logger;
  let manager: IOManager;
  let channels: IOChannel[];

  beforeEach(() => {
    channels = [];
    factory = vi.fn(async () => {
      const ch = makeChannel();
      channels.push(ch);
      return ch;
    }) as unknown as IOChannelFactory;

    registerService = vi.fn(
      (name: string): KernelService => ({
        name,
        kref: `ko${name}`,
        service: {},
        systemOnly: false,
      }),
    );
    unregisterService = vi.fn();
    logger = new Logger('test');

    manager = new IOManager({
      factory,
      registerService,
      unregisterService,
      logger,
    });
  });

  describe('createChannels', () => {
    it('creates channels and registers services', async () => {
      const ioConfig: Record<string, IOConfig> = {
        repl: { type: 'socket', path: '/tmp/repl.sock' } as IOConfig,
      };

      await manager.createChannels('s1', ioConfig);

      expect(factory).toHaveBeenCalledWith('repl', ioConfig.repl);
      expect(registerService).toHaveBeenCalledWith('repl', expect.any(Object));
    });

    it('creates multiple channels', async () => {
      const ioConfig: Record<string, IOConfig> = {
        input: { type: 'socket', path: '/tmp/in.sock' } as IOConfig,
        output: { type: 'socket', path: '/tmp/out.sock' } as IOConfig,
      };

      await manager.createChannels('s1', ioConfig);

      expect(factory).toHaveBeenCalledTimes(2);
      expect(registerService).toHaveBeenCalledTimes(2);
    });

    it('cleans up on factory failure', async () => {
      const successChannel = makeChannel();
      let callCount = 0;
      const failingFactory = vi.fn(async () => {
        callCount += 1;
        if (callCount === 2) {
          throw new Error('factory error');
        }
        return successChannel;
      }) as unknown as IOChannelFactory;

      const mgr = new IOManager({
        factory: failingFactory,
        registerService,
        unregisterService,
        logger,
      });

      const ioConfig: Record<string, IOConfig> = {
        first: { type: 'socket', path: '/tmp/a.sock' } as IOConfig,
        second: { type: 'socket', path: '/tmp/b.sock' } as IOConfig,
      };

      await expect(mgr.createChannels('s1', ioConfig)).rejects.toThrow(
        'factory error',
      );

      expect(successChannel.close).toHaveBeenCalledOnce();
      expect(unregisterService).toHaveBeenCalledWith('first');
    });
  });

  describe('destroyChannels', () => {
    it('closes channels and unregisters services', async () => {
      const ioConfig: Record<string, IOConfig> = {
        repl: { type: 'socket', path: '/tmp/repl.sock' } as IOConfig,
      };

      await manager.createChannels('s1', ioConfig);
      await manager.destroyChannels('s1');

      expect(channels[0]?.close).toHaveBeenCalledOnce();
      expect(unregisterService).toHaveBeenCalledWith('repl');
    });

    it('is idempotent for unknown subcluster', async () => {
      expect(await manager.destroyChannels('nonexistent')).toBeUndefined();
    });

    it('handles close errors gracefully', async () => {
      const errorChannel = makeChannel();
      (errorChannel.close as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('close failed'),
      );

      const errorFactory = vi.fn(
        async () => errorChannel,
      ) as unknown as IOChannelFactory;
      const errorSpy = vi.spyOn(logger, 'error');

      const mgr = new IOManager({
        factory: errorFactory,
        registerService,
        unregisterService,
        logger,
      });

      await mgr.createChannels('s1', {
        ch: { type: 'socket', path: '/tmp/ch.sock' } as IOConfig,
      });
      await mgr.destroyChannels('s1');

      expect(errorSpy).toHaveBeenCalledWith(
        'Error closing IO channel "ch":',
        expect.any(Error),
      );
    });
  });
});
