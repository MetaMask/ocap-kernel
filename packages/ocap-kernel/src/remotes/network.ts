import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { identify } from '@libp2p/identify';
import { MuxerClosedError } from '@libp2p/interface';
import type { PrivateKey } from '@libp2p/interface';
import { ping } from '@libp2p/ping';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { webTransport } from '@libp2p/webtransport';
import { AbortError, isRetryableNetworkError } from '@metamask/kernel-errors';
import {
  abortableDelay,
  calculateReconnectionBackoff,
  DEFAULT_MAX_RETRY_ATTEMPTS,
  fromHex,
  installWakeDetector,
  retryWithBackoff,
} from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { multiaddr } from '@multiformats/multiaddr';
import type { ByteStream } from 'it-byte-stream';
import { byteStream } from 'it-byte-stream';
import { createLibp2p } from 'libp2p';
import { toString as bufToString, fromString } from 'uint8arrays';

import type { SendRemoteMessage, StopRemoteComms } from '../types.ts';

type Channel = {
  msgStream: ByteStream;
  peerId: string;
  hints: string[];
};

type QueuedMsg = { message: string; hints: string[] };

type ReconnectionState = {
  isReconnecting: boolean;
  attemptCount: number; // completed attempts
  messageQueue: QueuedMsg[];
};

export type RemoteMessageHandler = (
  from: string,
  message: string,
) => Promise<string>;

/** Upper bound for queued outbound messages while reconnecting */
const MAX_QUEUE = 200;

/**
 * Generate the information needed for a network identity.
 *
 * @param seedString - Hex string containing the key seed.
 * @returns The private key pair.
 */
async function generateKeyInfo(seedString: string): Promise<PrivateKey> {
  const keyPair = await generateKeyPairFromSeed('Ed25519', fromHex(seedString));
  return keyPair;
}

/**
 * Initialize the remote comm system with information that must be provided by the kernel.
 *
 * @param keySeed - Seed value for key generation, in the form of a hex-encoded string.
 * @param knownRelays - PeerIds/Multiaddrs of known message relays.
 * @param remoteMessageHandler - Handler to be called when messages are received from elsewhere.
 *
 * @returns a function to send messages **and** a `stop()` to cancel/release everything.
 */
export async function initNetwork(
  keySeed: string,
  knownRelays: string[],
  remoteMessageHandler: RemoteMessageHandler,
): Promise<{
  sendRemoteMessage: SendRemoteMessage;
  stop: StopRemoteComms;
}> {
  const privateKey = await generateKeyInfo(keySeed);
  const activeChannels = new Map<string, Channel>(); // peerID -> channel info
  const reconnectionStates = new Map<string, ReconnectionState>(); // peerID -> reconnection state
  const inflightDials = new Map<string, Promise<Channel>>(); // peerID -> in-flight dial
  const stopController = new AbortController();
  const { signal } = stopController;

  const logger = new Logger();

  let cleanupWakeDetector: (() => void) | undefined;

  const libp2p = await createLibp2p({
    privateKey,
    addresses: {
      listen: ['/webrtc', '/p2p-circuit'],
      appendAnnounce: ['/webrtc'],
    },
    transports: [
      webSockets(),
      webTransport(),
      webRTC({
        rtcConfiguration: {
          iceServers: [
            {
              urls: [
                'stun:stun.l.google.com:19302',
                'stun:global.stun.twilio.com:3478',
              ],
            },
          ],
        },
      }),
      circuitRelayTransport(),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      // Allow private addresses for local testing
      denyDialMultiaddr: async () => false,
    },
    peerDiscovery: [
      bootstrap({
        list: knownRelays,
      }),
    ],
    services: {
      identify: identify(),
      ping: ping(),
    },
  });

  /**
   * Output an error message.
   *
   * @param peerId - The peer ID that the error is associated with.
   * @param task - The task that the error is associated with.
   * @param problem - The error itself.
   */
  function outputError(peerId: string, task: string, problem: unknown): void {
    if (problem) {
      const realProblem: Error = problem as Error;
      logger.log(`${peerId}:: error ${task}: ${realProblem}`);
    } else {
      logger.log(`${peerId}:: error ${task}`);
    }
  }

  /**
   * Get the reconnection state for a given peer ID.
   *
   * @param peerId - The peer ID to get the reconnection state for.
   * @returns The reconnection state for the given peer ID.
   */
  function getReconnectionState(peerId: string): ReconnectionState {
    let state = reconnectionStates.get(peerId);
    if (!state) {
      state = { isReconnecting: false, attemptCount: 0, messageQueue: [] };
      reconnectionStates.set(peerId, state);
    }
    return state;
  }

  /**
   * Reset the reconnection backoff for a given peer ID.
   *
   * @param peerId - The peer ID to reset the reconnection backoff for.
   */
  function resetReconnectionBackoff(peerId: string): void {
    getReconnectionState(peerId).attemptCount = 0;
  }

  /**
   * Get the candidate address strings for a given peer ID and hints.
   *
   * @param peerId - The peer ID to get the reconnection state for.
   * @param hints - The hints to use for the reconnection state.
   * @returns The candidate address strings for the given peer ID and hints.
   */
  function candidateAddressStrings(peerId: string, hints: string[]): string[] {
    const possibleContacts = hints.concat(
      ...knownRelays.filter((relay) => !hints.includes(relay)),
    );
    // Try WebRTC via relay first, then WebSocket via relay.
    return possibleContacts.flatMap((relay) => [
      `${relay}/p2p-circuit/webrtc/p2p/${peerId}`,
      `${relay}/p2p-circuit/p2p/${peerId}`,
    ]);
  }

  /**
   * Single-attempt channel open (no backoff here).
   * Throws if all strategies fail.
   *
   * @param peerId - The peer ID to open a channel for.
   * @param hints - The hints to use for the channel.
   * @returns The channel.
   */
  async function openChannelOnce(
    peerId: string,
    hints: string[] = [],
  ): Promise<Channel> {
    const addresses = candidateAddressStrings(peerId, hints);
    // Combine shutdown signal with a per-dial timeout
    const signalTimeout = AbortSignal.timeout(30_000);

    let lastError: Error | undefined;

    for (const addressString of addresses) {
      if (signal.aborted) {
        throw new AbortError();
      }
      try {
        const connectToAddr = multiaddr(addressString);
        logger.log(`contacting ${peerId} via ${addressString}`);
        const stream = await libp2p.dialProtocol(connectToAddr, 'whatever', {
          signal: signalTimeout,
        });
        if (stream) {
          logger.log(
            `successfully connected to ${peerId} via ${addressString}`,
          );
          const msgStream = byteStream(stream);
          const created: Channel = { msgStream, peerId, hints };
          activeChannels.set(peerId, created);
          logger.log(`opened channel to ${peerId}`);
          return created;
        }
      } catch (problem) {
        lastError = problem as Error;
        if (signal.aborted) {
          throw new AbortError();
        }
        if (problem instanceof MuxerClosedError) {
          outputError(
            peerId,
            `yamux muxer issue contacting via ${addressString}`,
            problem,
          );
        } else if (signalTimeout.aborted) {
          outputError(peerId, `timed out opening channel`, problem);
        } else {
          outputError(peerId, `issue opening channel`, problem);
        }
      }
    }

    throw lastError ?? new Error(`unable to open channel to ${peerId}`);
  }

  /**
   * Backoff-capable open (useful for initial connect)
   *
   * @param peerId - The peer ID to open a channel for.
   * @param hints - The hints to use for the channel.
   * @returns The channel.
   */
  async function openChannelWithRetry(
    peerId: string,
    hints: string[] = [],
  ): Promise<Channel> {
    return retryWithBackoff(async () => openChannelOnce(peerId, hints), {
      jitter: true,
      shouldRetry: isRetryableNetworkError,
      onRetry: ({ attempt, maxAttempts, delayMs }) => {
        logger.log(
          `retrying connection to ${peerId} in ${delayMs}ms (next attempt ${attempt}/${maxAttempts || '∞'})`,
        );
      },
      signal,
    });
  }

  /**
   * Ensure only one dial attempt per peer at a time
   *
   * @param peerId - The peer ID to dial.
   * @param hints - The hints to use for the dial.
   * @param withRetry - Whether to retry the dial.
   * @returns The channel.
   */
  async function dialIdempotent(
    peerId: string,
    hints: string[],
    withRetry: boolean,
  ): Promise<Channel> {
    const key = peerId; // could include hashed hints if you need to distinguish
    let promise = inflightDials.get(key);
    if (!promise) {
      promise = (
        withRetry
          ? openChannelWithRetry(peerId, hints)
          : openChannelOnce(peerId, hints)
      ).finally(() => inflightDials.delete(key));
      inflightDials.set(key, promise);
    }
    return promise;
  }

  /**
   * Start reading (and processing) messages arriving on a channel.
   *
   * @param channel - The channel to read from.
   */
  async function readChannel(channel: Channel): Promise<void> {
    const SCTP_USER_INITIATED_ABORT = 12; // RFC 4960
    for (;;) {
      if (signal.aborted) {
        logger.log(`reader abort: ${channel.peerId}`);
        throw new AbortError();
      }
      let readBuf;
      try {
        readBuf = await channel.msgStream.read();
      } catch (problem) {
        // Detect graceful disconnect
        const rtcProblem = problem as {
          errorDetail?: string;
          sctpCauseCode?: number;
        };
        if (
          rtcProblem?.errorDetail === 'sctp-failure' &&
          rtcProblem?.sctpCauseCode === SCTP_USER_INITIATED_ABORT
        ) {
          logger.log(`${channel.peerId}:: remote disconnected`);
        } else {
          outputError(
            channel.peerId,
            `reading message from ${channel.peerId}`,
            problem,
          );
        }
        logger.log(`closed channel to ${channel.peerId}`);
        handleConnectionLoss(channel.peerId, channel.hints);
        throw problem;
      }
      if (readBuf) {
        resetReconnectionBackoff(channel.peerId); // successful inbound traffic
        await receiveMsg(channel.peerId, bufToString(readBuf.subarray()));
      }
    }
  }

  /**
   * Receive a message from a peer.
   *
   * @param from - The peer ID that the message is from.
   * @param message - The message to receive.
   */
  async function receiveMsg(from: string, message: string): Promise<void> {
    logger.log(`${from}:: recv ${message}`);
    await remoteMessageHandler(from, message);
  }

  /**
   * Attempt to reconnect to a peer after connection loss.
   * Single orchestration loop per peer; abortable.
   *
   * @param peerId - The peer ID to reconnect to.
   * @param hints - The hints to use for the reconnection.
   * @param maxAttempts - The maximum number of reconnection attempts. 0 = infinite.
   */
  async function attemptReconnection(
    peerId: string,
    hints: string[] = [],
    maxAttempts = DEFAULT_MAX_RETRY_ATTEMPTS,
  ): Promise<void> {
    const state = getReconnectionState(peerId);

    while (state.isReconnecting && !signal.aborted) {
      if (maxAttempts > 0 && state.attemptCount >= maxAttempts) {
        logger.log(
          `${peerId}:: max reconnection attempts (${maxAttempts}) reached, giving up`,
        );
        state.isReconnecting = false;
        state.messageQueue = [];
        return;
      }

      const nextAttempt = state.attemptCount + 1; // 1-based
      const delayMs = calculateReconnectionBackoff(nextAttempt);
      logger.log(
        `${peerId}:: scheduling reconnection attempt ${nextAttempt}${maxAttempts ? `/${maxAttempts}` : ''} in ${delayMs}ms`,
      );

      try {
        await abortableDelay(delayMs, signal);
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        throw error;
      }

      state.attemptCount = nextAttempt;
      logger.log(
        `${peerId}:: reconnection attempt ${state.attemptCount}${maxAttempts ? `/${maxAttempts}` : ''}`,
      );

      try {
        const channel = await dialIdempotent(
          peerId,
          hints,
          /* withRetry*/ false,
        );
        logger.log(`${peerId}:: reconnection successful`);

        // Reset reconnection state
        state.isReconnecting = false;
        state.attemptCount = 0;

        // Start reading from the new channel
        readChannel(channel).catch((problem) => {
          outputError(peerId, `reading channel to`, problem);
        });

        // Flush queued messages
        const queued = state.messageQueue.splice(0);
        logger.log(`${peerId}:: flushing ${queued.length} queued messages`);
        for (const { message } of queued) {
          try {
            logger.log(`${peerId}:: send (queued) ${message}`);
            await channel.msgStream.write(fromString(message));
            resetReconnectionBackoff(peerId);
          } catch (problem) {
            outputError(peerId, `sending queued message`, problem);
            // reader will trigger reconnection again
            break;
          }
        }
        return; // success
      } catch (problem) {
        if (signal.aborted) {
          return;
        }
        if (!isRetryableNetworkError(problem)) {
          outputError(peerId, `non-retryable failure`, problem);
          state.isReconnecting = false;
          state.messageQueue = [];
          return;
        }
        outputError(
          peerId,
          `reconnection attempt ${state.attemptCount}`,
          problem,
        );
        // loop to next attempt
      }
    }
  }

  /**
   * Handle connection loss for a given peer ID.
   *
   * @param peerId - The peer ID to handle the connection loss for.
   * @param hints - The hints to use for the connection loss.
   */
  function handleConnectionLoss(peerId: string, hints: string[] = []): void {
    logger.log(`${peerId}:: connection lost, initiating reconnection`);
    activeChannels.delete(peerId);

    const state = getReconnectionState(peerId);
    if (!state.isReconnecting) {
      state.isReconnecting = true;
      attemptReconnection(peerId, hints).catch((problem) => {
        outputError(peerId, 'reconnection error', problem);
        state.isReconnecting = false;
      });
    }
  }

  /**
   * Send a message to a peer.
   *
   * @param targetPeerId - The peer ID to send the message to.
   * @param message - The message to send.
   * @param hints - The hints to use for the message.
   */
  async function sendRemoteMessage(
    targetPeerId: string,
    message: string,
    hints: string[] = [],
  ): Promise<void> {
    if (signal.aborted) {
      return;
    }

    const state = getReconnectionState(targetPeerId);

    if (state.isReconnecting) {
      if (state.messageQueue.length >= MAX_QUEUE) {
        state.messageQueue.shift();
      } // drop oldest
      state.messageQueue.push({ message, hints });
      logger.log(
        `${targetPeerId}:: queueing message during reconnection ` +
          `(${state.messageQueue.length}/${MAX_QUEUE}): ${message}`,
      );
      return;
    }

    let channel = activeChannels.get(targetPeerId);
    if (!channel) {
      try {
        channel = await dialIdempotent(
          targetPeerId,
          hints,
          /* withRetry*/ true,
        );
      } catch (problem) {
        outputError(targetPeerId, `opening connection`, problem);
        handleConnectionLoss(targetPeerId, hints);
        if (state.messageQueue.length >= MAX_QUEUE) {
          state.messageQueue.shift();
        }
        state.messageQueue.push({ message, hints });
        return;
      }

      readChannel(channel).catch((problem) => {
        outputError(targetPeerId, `reading channel to`, problem);
      });
    }

    try {
      logger.log(`${targetPeerId}:: send ${message}`);
      await channel.msgStream.write(fromString(message));
      resetReconnectionBackoff(targetPeerId);
    } catch (problem) {
      outputError(targetPeerId, `sending message`, problem);
      handleConnectionLoss(targetPeerId, hints);
      if (state.messageQueue.length >= MAX_QUEUE) {
        state.messageQueue.shift();
      }
      state.messageQueue.push({ message, hints });
    }
  }

  /**
   * Reset the reconnection backoff tails for all peers.
   * Called when system wakes from sleep.
   */
  function handleWakeFromSleep(): void {
    logger.log('Wake from sleep detected, resetting reconnection backoffs');
    for (const [, state] of reconnectionStates) {
      if (state.isReconnecting) {
        state.attemptCount = 0;
      }
    }
  }

  // Inbound handler
  await libp2p.handle('whatever', ({ connection, stream }) => {
    const msgStream = byteStream(stream);
    const remotePeerId = connection.remotePeer.toString();
    logger.log(`inbound connection from peerId:${remotePeerId}`);
    const channel: Channel = { msgStream, peerId: remotePeerId, hints: [] };
    activeChannels.set(remotePeerId, channel);
    readChannel(channel).catch((error) => {
      outputError(remotePeerId, 'error in inbound channel read', error);
    });
  });

  // Start libp2p
  logger.log(`Starting libp2p node with peerId: ${libp2p.peerId.toString()}`);
  logger.log(`Connecting to relays: ${knownRelays.join(', ')}`);
  libp2p.addEventListener('self:peer:update', (evt) => {
    logger.log(`Peer update: ${JSON.stringify(evt.detail)}`);
  });
  await libp2p.start();

  // Install wake detector to reset backoff on sleep/wake
  cleanupWakeDetector = installWakeDetector(handleWakeFromSleep);

  /**
   * Stop the network.
   */
  async function stop(): Promise<void> {
    logger.log('Stopping kernel network...');

    // Stop wake detector
    if (cleanupWakeDetector) {
      cleanupWakeDetector();
      cleanupWakeDetector = undefined;
    }

    stopController.abort(); // cancels all delays and dials
    try {
      await libp2p.stop();
    } catch (error) {
      logger.error('Error while stopping libp2p', error);
    }
    activeChannels.clear();
    reconnectionStates.clear();
    inflightDials.clear();
  }

  // return the sender with a stop handle
  return { sendRemoteMessage, stop };
}
