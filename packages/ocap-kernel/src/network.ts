import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { identify } from '@libp2p/identify';
import type { PrivateKey } from '@libp2p/interface';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { webTransport } from '@libp2p/webtransport';
import { fromHex } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { multiaddr } from '@multiformats/multiaddr';
import type { ByteStream } from 'it-byte-stream';
import { byteStream } from 'it-byte-stream';
import { createLibp2p } from 'libp2p';
import { toString as bufToString, fromString } from 'uint8arrays';

import type { SendRemoteMessage } from './types.ts';

type Channel = {
  msgStream: ByteStream;
  peerId: string;
};

export type RemoteMessageHandler = (
  from: string,
  message: string,
) => Promise<string>;

/**
 * Generate the information needed for a network identity.
 *
 * @param seedString - Hex string containing the key seed.
 *
 * @returns the private key generated from the seed.
 */
async function generateKeyInfo(seedString: string): Promise<PrivateKey> {
  const keyPair = await generateKeyPairFromSeed('Ed25519', fromHex(seedString));
  return keyPair;
}

/**
 * Initialize the remote comm system with information that must be provided by the kernel.
 *
 * @param keySeed - Seed value for key generation, in the form of a hex-encoded string.
 * @param knownRelays - PeerIds of known message relays.
 * @param remoteMessageHandler - Handler to be called when messages are received from elsewhere.
 *
 * @returns a promise for a function that can be used to send network communications.
 */
export async function initNetwork(
  keySeed: string,
  knownRelays: string[],
  remoteMessageHandler: RemoteMessageHandler,
): Promise<SendRemoteMessage> {
  const privateKey = await generateKeyInfo(keySeed);
  const activeChannels = new Map<string, Channel>(); // peerID -> channel info
  const logger = new Logger();

  const libp2p = await createLibp2p({
    privateKey,
    addresses: {
      listen: [
        // TODO: Listen on tcp addresses for Node.js
        // '/ip4/0.0.0.0/tcp/0/ws',
        // '/ip4/0.0.0.0/tcp/0',
        // Browser: listen on WebRTC and circuit relay
        '/webrtc',
        '/p2p-circuit',
      ],
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
      circuitRelayTransport({
        // Automatically make reservations on connected relays
        reservationConcurrency: 1,
      }),
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
    },
  });

  /**
   * Output information about an error that happened.
   *
   * @param peerId - The network node the error was associated with.
   * @param task - What we were trying to do at the time.
   * @param problem - The error itself.
   */
  function outputError(peerId: string, task: string, problem: unknown): void {
    if (problem) {
      const realProblem: Error = problem as Error; // to make eslint stfu
      logger.log(`${peerId}:: error ${task}: ${realProblem}`);
    } else {
      logger.log(`${peerId}:: error ${task}`);
    }
  }

  /**
   * Act upon a message received from another network node.
   *
   * @param from - The network node received from.
   * @param message - The message that was received.
   */
  async function receiveMsg(from: string, message: string): Promise<void> {
    logger.log(`${from}:: recv ${message}`);
    await remoteMessageHandler(from, message);
  }

  /**
   * Transmit a message to some other network node.
   *
   * @param targetPeerId - The peerId of the intended message destination.
   * @param message - The message itself.
   */
  async function sendRemoteMessage(
    targetPeerId: string,
    message: string,
  ): Promise<void> {
    let channel = activeChannels.get(targetPeerId);
    if (!channel) {
      try {
        channel = await openChannel(targetPeerId);
      } catch (problem) {
        outputError(targetPeerId, 'opening connection', problem);
      }
      if (!channel) {
        return;
      }
      readChannel(channel).catch((problem) => {
        outputError(targetPeerId, 'reading channel', problem);
      });
    }
    try {
      logger.log(`${targetPeerId}:: send ${message}`);
      await channel.msgStream.write(fromString(message));
    } catch (problem) {
      outputError(targetPeerId, 'sending message', problem);
    }
  }

  const SCTP_USER_INITIATED_ABORT = 12; // see RFC 4960

  /**
   * Start reading (and processing) messages arriving on a channel.
   *
   * @param channel - The Channel to start reading from.
   */
  async function readChannel(channel: Channel): Promise<void> {
    for (;;) {
      let readBuf;
      try {
        readBuf = await channel.msgStream.read();
      } catch (problem) {
        const rtcProblem = problem as RTCError;
        if (
          rtcProblem.errorDetail === 'sctp-failure' &&
          rtcProblem?.sctpCauseCode === SCTP_USER_INITIATED_ABORT
        ) {
          logger.log(`${channel.peerId}:: remote disconnected`);
        } else {
          outputError(channel.peerId, 'reading message', problem);
        }
        logger.log(`closed channel to ${channel.peerId}`);
        activeChannels.delete(channel.peerId);
        throw problem;
      }
      if (readBuf) {
        await receiveMsg(channel.peerId, bufToString(readBuf.subarray()));
      }
    }
  }

  /**
   * Open a channel to the node with the given target peerId.
   *
   * @param peerId - The network node to connect to.
   *
   * @returns a Channel to `peerId`.
   */
  async function openChannel(peerId: string): Promise<Channel> {
    logger.log(`connecting to ${peerId}`);
    const signal = AbortSignal.timeout(30_000);

    let stream;
    let lastError: Error | undefined;

    // Try multiple connection strategies
    const addressStrings: string[] = knownRelays.flatMap((relay) => [
      // Browser: try WebRTC first
      `${relay}/p2p-circuit/webrtc/p2p/${peerId}`,
      // Both environments can use WebSocket through relay
      `${relay}/p2p-circuit/p2p/${peerId}`,
    ]);

    // TODO: Try direct tcp connection without relay for Node.js
    // `/dns4/localhost/tcp/0/ws/p2p/${peerId}`,
    // `/ip4/127.0.0.1/tcp/0/ws/p2p/${peerId}`,

    for (const addressString of addressStrings) {
      try {
        const connectToAddr = multiaddr(addressString);
        logger.log(`trying address: ${addressString}`);
        stream = await libp2p.dialProtocol(connectToAddr, 'whatever', {
          signal,
        });
        if (stream) {
          logger.log(`successfully connected via ${addressString}`);
          break;
        }
      } catch (problem) {
        lastError = problem as Error;
        outputError(peerId, `failed with address ${addressString}`, problem);
        // Continue to next address
      }
    }

    if (!stream) {
      if (signal.aborted) {
        outputError(peerId, `timed out opening channel`, lastError);
      } else {
        outputError(
          peerId,
          `opening channel after trying all addresses`,
          lastError,
        );
      }
      throw lastError ?? Error('Failed to connect');
    }
    const msgStream = byteStream(stream);
    const channel: Channel = { msgStream, peerId };
    activeChannels.set(peerId, channel);
    logger.log(`opened channel to ${peerId}`);
    return channel;
  }

  await libp2p.handle('whatever', ({ connection, stream }) => {
    const msgStream = byteStream(stream);
    const remotePeerId = connection.remotePeer.toString();
    logger.log(`inbound connection from peerId:${remotePeerId}`);
    const channel: Channel = { msgStream, peerId: remotePeerId };
    activeChannels.set(remotePeerId, channel);
    readChannel(channel).catch((error) => {
      outputError(remotePeerId, 'error in inbound channel read', error);
      activeChannels.delete(remotePeerId);
    });
  });

  // Start the libp2p node
  logger.log(`Starting libp2p node with peerId: ${libp2p.peerId.toString()}`);
  logger.log(`Connecting to relays: ${knownRelays.join(', ')}`);

  // Wait for relay connection and reservation
  libp2p.addEventListener('self:peer:update', (evt) => {
    logger.log(`Peer update: ${JSON.stringify(evt.detail)}`);
  });

  return sendRemoteMessage;
}
