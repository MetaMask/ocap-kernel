import { AbortError } from '@metamask/kernel-errors';
import type { Logger } from '@metamask/logger';
import { toString as bufToString } from 'uint8arrays';

import type { PeerRegistry } from './peer-registry.ts';
import type { Channel, RemoteMessageHandler } from '../types.ts';

/** SCTP user-initiated abort code (RFC 4960) */
const SCTP_USER_INITIATED_ABORT = 12;

type ChannelReaderDeps = {
  peerRegistry: PeerRegistry;
  remoteMessageHandler: RemoteMessageHandler;
  signal: AbortSignal;
  logger: Logger;
  onConnectionLoss: (peerId: string, channel?: Channel) => void;
  onMessageReceived: (peerId: string) => void;
  outputError: (peerId: string, task: string, problem: unknown) => void;
};

/**
 * Creates a channel reader that processes incoming messages from peer channels.
 *
 * @param deps - Dependencies for the channel reader.
 * @returns Object with methods for reading channels.
 */
export function makeChannelReader(deps: ChannelReaderDeps): {
  readChannel: (channel: Channel) => Promise<void>;
} {
  const {
    peerRegistry,
    remoteMessageHandler,
    signal,
    logger,
    onConnectionLoss,
    onMessageReceived,
    outputError,
  } = deps;

  /**
   * Receive a message from a peer.
   *
   * @param from - The peer ID that the message is from.
   * @param message - The message to receive.
   */
  async function receiveMessage(from: string, message: string): Promise<void> {
    logger.log(`${from}:: recv ${message}`);
    await remoteMessageHandler(from, message);
  }

  /**
   * Start reading (and processing) messages arriving on a channel.
   *
   * @param channel - The channel to read from.
   */
  async function readChannel(channel: Channel): Promise<void> {
    try {
      for (;;) {
        if (signal.aborted) {
          logger.log(`reader abort: ${channel.peerId}`);
          throw new AbortError();
        }
        let readBuf;
        try {
          readBuf = await channel.msgStream.read();
        } catch (problem) {
          const isCurrentChannel =
            peerRegistry.getChannel(channel.peerId) === channel;
          // Detect graceful disconnect
          const rtcProblem = problem as {
            errorDetail?: string;
            sctpCauseCode?: number;
          };
          if (
            rtcProblem?.errorDetail === 'sctp-failure' &&
            rtcProblem?.sctpCauseCode === SCTP_USER_INITIATED_ABORT
          ) {
            if (isCurrentChannel) {
              logger.log(
                `${channel.peerId}:: remote intentionally disconnected`,
              );
              // Mark as intentionally closed and don't trigger reconnection
              peerRegistry.markIntentionallyClosed(channel.peerId);
            } else {
              logger.log(
                `${channel.peerId}:: stale channel intentionally disconnected`,
              );
            }
          } else if (isCurrentChannel) {
            outputError(
              channel.peerId,
              `reading message from ${channel.peerId}`,
              problem,
            );
            // Only trigger reconnection for non-intentional disconnects
            onConnectionLoss(channel.peerId, channel);
          } else {
            logger.log(`${channel.peerId}:: ignoring error from stale channel`);
          }
          logger.log(`closed channel to ${channel.peerId}`);
          throw problem;
        }
        if (readBuf) {
          onMessageReceived(channel.peerId);
          peerRegistry.updateLastConnectionTime(channel.peerId);
          await receiveMessage(channel.peerId, bufToString(readBuf.subarray()));
        } else {
          // Stream ended (returned undefined), exit the read loop
          logger.log(`${channel.peerId}:: stream ended`);
          break;
        }
      }
    } finally {
      // Always remove the channel when readChannel exits to prevent stale channels
      // This ensures that subsequent sends will establish a new connection
      if (peerRegistry.getChannel(channel.peerId) === channel) {
        peerRegistry.removeChannel(channel.peerId);
      }
    }
  }

  return {
    readChannel,
  };
}
