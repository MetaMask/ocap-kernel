import type { NetlayerHooks } from '@metamask/netlayer';

/**
 * A registration record for a peer connected to a {@link LoopbackHub}.
 */
export type LoopbackRegistration = {
  /** The peer's inbound message handler (`NetlayerHooks.handleMessage`). */
  receive: NetlayerHooks['handleMessage'];
  /** The peer's incarnation id, reported to counterparts on first contact. */
  incarnationId: string;
};

/**
 * An in-memory hub that routes messages between loopback netlayers in the same
 * JavaScript realm, keyed by neutral peerId. It holds no global state — callers
 * create a hub with {@link makeLoopbackHub} and hand the same instance to every
 * netlayer that should be able to reach one another.
 */
export type LoopbackHub = {
  /**
   * Register a peer's inbound handler and incarnation.
   *
   * @param peerId - The neutral peer id.
   * @param receive - The peer's `handleMessage` hook.
   * @param incarnationId - The peer's incarnation id.
   */
  register: (
    peerId: string,
    receive: NetlayerHooks['handleMessage'],
    incarnationId: string,
  ) => void;
  /**
   * Remove a peer's registration.
   *
   * @param peerId - The neutral peer id to unregister.
   */
  unregister: (peerId: string) => void;
  /**
   * The incarnation id a registered peer reported, if it is registered.
   *
   * @param peerId - The neutral peer id.
   * @returns The peer's incarnation id, or undefined if not registered.
   */
  getIncarnation: (peerId: string) => string | undefined;
  /**
   * Deliver a message from one peer to another and return the target's reply.
   *
   * @param from - The sending peer's neutral id.
   * @param to - The target peer's neutral id.
   * @param message - The serialized message.
   * @returns The target's reply string, or null.
   * @throws If no peer is registered under `to`.
   */
  deliver: (
    from: string,
    to: string,
    message: string,
  ) => Promise<string | null>;
};

/**
 * Create a new in-process loopback hub.
 *
 * @returns A hardened {@link LoopbackHub}.
 */
export function makeLoopbackHub(): LoopbackHub {
  const registrations = new Map<string, LoopbackRegistration>();

  return harden({
    register: (peerId, receive, incarnationId) => {
      registrations.set(peerId, { receive, incarnationId });
    },
    unregister: (peerId) => {
      registrations.delete(peerId);
    },
    getIncarnation: (peerId) => registrations.get(peerId)?.incarnationId,
    deliver: async (from, to, message) => {
      const registration = registrations.get(to);
      if (!registration) {
        throw new Error(`Cannot deliver to unregistered peer: ${to}`);
      }
      return registration.receive(from, message);
    },
  });
}
