import type { ConnectionFactory } from './connection-factory.ts';
import type { PeerRegistry } from './peer-registry.ts';
import type { Channel } from '../types.ts';

/**
 * Check if an existing channel exists for a peer, and if so, reuse it.
 * Otherwise, return the dialed channel for the caller to register.
 *
 * @param peerId - The peer ID for the channel.
 * @param dialedChannel - The newly dialed channel.
 * @param peerRegistry - The peer registry to check for existing channels.
 * @param connectionFactory - The connection factory to close channels.
 * @returns The channel to use, or null if existing channel died and dialed was closed.
 */
export async function reuseOrReturnChannel(
  peerId: string,
  dialedChannel: Channel,
  peerRegistry: PeerRegistry,
  connectionFactory: ConnectionFactory,
): Promise<Channel | null> {
  const existingChannel = peerRegistry.getChannel(peerId);
  if (existingChannel) {
    if (dialedChannel !== existingChannel) {
      await connectionFactory.closeChannel(dialedChannel, peerId);
      const currentChannel = peerRegistry.getChannel(peerId);
      if (currentChannel === existingChannel) {
        return existingChannel;
      }
      if (currentChannel) {
        return currentChannel;
      }
      return null;
    }
    const currentChannel = peerRegistry.getChannel(peerId);
    if (currentChannel === existingChannel) {
      return existingChannel;
    }
    if (currentChannel) {
      return currentChannel;
    }
    return null;
  }
  return dialedChannel;
}
