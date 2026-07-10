import {
  IntentionalCloseError,
  NetworkStoppedError,
} from '@metamask/kernel-errors';
import { fromHex } from '@metamask/kernel-utils';
import { deriveNeutralPeerId } from '@metamask/netlayer';
import type { Netlayer, NetlayerFactory } from '@metamask/netlayer';
import { assert, object, optional, string } from '@metamask/superstruct';

import type { LoopbackHub } from './hub.ts';

/**
 * Config for a loopback netlayer. Because `hub` is a live object (not `Json`), a
 * loopback {@link NetlayerSpecifier} cannot cross a postMessage boundary —
 * loopback is same-realm only, by design.
 */
export type LoopbackConfig = {
  /** The shared in-process hub. Two netlayers connect by sharing one hub. */
  hub: LoopbackHub;
  /** Optional incarnation id, if not supplied at the top level of the params. */
  incarnationId?: string | undefined;
};

/** Struct validating the serializable (non-hub) parts of {@link LoopbackConfig}. */
const LoopbackConfigStruct = object({
  incarnationId: optional(string()),
});

/**
 * In-process hub netlayer. Implements the full {@link Netlayer} contract by
 * routing messages through a shared {@link LoopbackHub}, without channels,
 * handshakes, rate limiting, or backoff — the point is to exercise the
 * kernel/PlatformServices path and the `Netlayer` contract, not the channel
 * machinery.
 *
 * @param params - The netlayer params.
 * @param params.keySeed - Hex-encoded key seed; the peer id is derived from it
 * the same way real netlayers derive theirs, so loopback peerIds are
 * interchangeable with libp2p peerIds in kernel state.
 * @param params.incarnationId - This kernel's incarnation id.
 * @param params.hooks - Kernel-supplied callbacks.
 * @param params.config - The loopback config (carries the shared hub).
 * @returns The loopback netlayer.
 */
export const makeLoopbackNetlayer: NetlayerFactory<LoopbackConfig> =
  async function makeLoopbackNetlayer({
    keySeed,
    incarnationId,
    hooks,
    config,
  }): Promise<Netlayer> {
    if (
      typeof config !== 'object' ||
      config === null ||
      !('hub' in config) ||
      typeof config.hub !== 'object' ||
      config.hub === null
    ) {
      throw new Error('LoopbackConfig requires a hub object');
    }
    assert({ incarnationId: config.incarnationId }, LoopbackConfigStruct);
    const { hub } = config;

    const peerId = deriveNeutralPeerId(fromHex(keySeed));
    const myIncarnation = incarnationId ?? config.incarnationId ?? peerId;
    let stopped = false;
    const closedPeers = new Set<string>();
    const contactedPeers = new Set<string>();

    hub.register(peerId, hooks.handleMessage, myIncarnation);

    /**
     * Feed a reply we received back into this peer's inbound path, mirroring the
     * channel engine's `receiveMessage` reply handling: run `handleMessage` and
     * fire-and-forget any further reply back to the origin.
     *
     * @param from - The peer the reply came from.
     * @param message - The reply message.
     */
    async function deliverInbound(
      from: string,
      message: string,
    ): Promise<void> {
      const reply = await hooks.handleMessage(from, message);
      if (reply) {
        sendRemoteMessage(from, reply).catch(() => {
          // The origin may have stopped or closed; drop the reply.
        });
      }
    }

    /**
     * Send a message to a peer through the hub. The hub routes it to the
     * target's `handleMessage`; any reply is routed back into this peer's
     * inbound path, so the Ken protocol's seq/ack round-trips work.
     *
     * @param to - The target peer id.
     * @param message - The serialized message.
     */
    async function sendRemoteMessage(
      to: string,
      message: string,
    ): Promise<void> {
      if (stopped) {
        throw new NetworkStoppedError();
      }
      if (closedPeers.has(to)) {
        throw new IntentionalCloseError();
      }
      // On first contact, report the peer's incarnation directly (no handshake
      // — loopback is trusted, same-realm).
      if (!contactedPeers.has(to)) {
        contactedPeers.add(to);
        const observed = hub.getIncarnation(to) ?? to;
        await hooks.onIncarnationChange?.(to, observed);
      }
      const reply = await hub.deliver(peerId, to, message);
      if (reply) {
        deliverInbound(to, reply).catch(() => {
          // Inbound handling errors are non-fatal for the sender.
        });
      }
    }

    return harden({
      peerId,
      sendRemoteMessage,
      closeConnection: async (targetPeerId: string): Promise<void> => {
        closedPeers.add(targetPeerId);
      },
      registerLocationHints: (): void => {
        // No hints in-process.
      },
      reconnectPeer: async (targetPeerId: string): Promise<void> => {
        // Clear any intentional-close mark so subsequent sends succeed again.
        closedPeers.delete(targetPeerId);
      },
      resetAllBackoffs: (): void => {
        // No backoff in-process.
      },
      getListenAddresses: (): string[] => [],
      stop: async (): Promise<void> => {
        stopped = true;
        hub.unregister(peerId);
      },
    });
  };
