import { Logger } from '@metamask/logger';
import type {
  Netlayer,
  OnIncarnationChange,
  OnRemoteGiveUp,
  RemoteCommsOptions,
  RemoteMessageHandler,
} from '@metamask/netlayer';
import { makeLoopbackNetlayer } from '@metamask/netlayer-loopback';
import type { LoopbackHub } from '@metamask/netlayer-loopback';
import { vi } from 'vitest';

import type { PlatformServices } from '../src/types.ts';

/**
 * Options for {@link makeLoopbackPlatformServices}.
 */
export type LoopbackPlatformServicesOptions = {
  /** The shared in-process hub. */
  hub: LoopbackHub;
};

/**
 * Build a {@link PlatformServices} whose remote-comms methods are backed by a
 * real loopback {@link Netlayer} sharing the given hub, so two instances can
 * actually move bytes between them in-process. The vat-launch methods
 * (`launch`/`terminate`/`terminateAll`) remain `vi.fn()` stubs — loopback is
 * about remote comms only.
 *
 * @param options - The build options.
 * @returns A loopback-backed PlatformServices.
 */
export function makeLoopbackPlatformServices(
  options: LoopbackPlatformServicesOptions,
): PlatformServices {
  const { hub } = options;
  let netlayer: Netlayer | undefined;

  const requireNetlayer = (): Netlayer => {
    if (!netlayer) {
      throw new Error('remote comms not initialized');
    }
    return netlayer;
  };

  return {
    launch: vi.fn(),
    terminate: vi.fn(),
    terminateAll: vi.fn(),
    initializeRemoteComms: async (
      keySeed: string,
      _options: RemoteCommsOptions,
      remoteMessageHandler: RemoteMessageHandler,
      onRemoteGiveUp?: OnRemoteGiveUp,
      incarnationId?: string,
      onIncarnationChange?: OnIncarnationChange,
    ): Promise<void> => {
      const created = await makeLoopbackNetlayer({
        keySeed,
        incarnationId,
        hooks: {
          handleMessage: remoteMessageHandler,
          onRemoteGiveUp,
          onIncarnationChange,
        },
        config: { hub },
        logger: new Logger(),
      });
      netlayer = created;
    },
    sendRemoteMessage: async (to: string, message: string): Promise<void> => {
      await requireNetlayer().sendRemoteMessage(to, message);
    },
    stopRemoteComms: async (): Promise<void> => {
      const current = netlayer;
      netlayer = undefined;
      await current?.stop();
    },
    closeConnection: async (peerId: string): Promise<void> => {
      await requireNetlayer().closeConnection(peerId);
    },
    registerLocationHints: async (
      peerId: string,
      hints: string[],
    ): Promise<void> => {
      requireNetlayer().registerLocationHints(peerId, hints);
    },
    reconnectPeer: async (peerId: string, hints?: string[]): Promise<void> => {
      await requireNetlayer().reconnectPeer(peerId, hints);
    },
    resetAllBackoffs: async (): Promise<void> => {
      requireNetlayer().resetAllBackoffs();
    },
    getListenAddresses: (): string[] =>
      netlayer ? netlayer.getListenAddresses() : [],
  };
}
