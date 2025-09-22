import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import type { YamuxMuxerInit } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { identify } from '@libp2p/identify';
import { MuxerClosedError } from '@libp2p/interface';
import type { PrivateKey, Libp2pEvents, DialOptions } from '@libp2p/interface';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { webTransport } from '@libp2p/webtransport';
import { fromHex } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { multiaddr } from '@multiformats/multiaddr';
import type { Multiaddr } from '@multiformats/multiaddr';
import type { ByteStream } from 'it-byte-stream';
import { byteStream } from 'it-byte-stream';
import { createLibp2p } from 'libp2p';
import { toString as bufToString, fromString } from 'uint8arrays';
import { ping } from '@libp2p/ping'; // XXX probably bogus

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
  localStorage.debug = 'libp2p:transports*,libp2p:components*'; // XXX expunge

  const privateKey = await generateKeyInfo(keySeed);
  const activeChannels = new Map<string, Channel>(); // peerID -> channel info
  const logger = new Logger();

  function legibleConnectionDetails(raw: any): string {
    const result = {
      direction: raw.direction,
      encryption: raw.encryption,
      id: raw.id,
      remoteAddr: raw.remoteAddr.toString(),
      remotePeer: raw.remotePeer.toString(),
    };
    return JSON.stringify(result);
  }

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
            { urls: 'stun:stun.l.google.com:19302' },
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
    const eventTypes = [
    'certificate:provision',
    'certificate:renew',
    'connection:close',
    'connection:open',
    'connection:prune',
    'peer:connect',
    'peer:disconnect',
    'peer:discovery',
    'peer:identify',
    'peer:reconnect-failure',
    'peer:update',
    'self:peer:update',
    'start',
    'stop',
    'transport:close',
    'transport:listening',
    ];
  for (const et of eventTypes) {
    libp2p.addEventListener(et as keyof Libp2pEvents, (event) => {
      if (et === 'connection:open' || et === 'connection:close') {
        console.log(`@@@@ libp2p ${et} ${legibleConnectionDetails(event.detail)}`);
      } else {
        console.log(`@@@@ libp2p ${et} ${JSON.stringify(event.detail)}`);
      }
    });
  }

  /**
   * Output a line of text.
   *
   * @param text - The text to output.
   */
  function outputLine(text: string): void {
    logger.log(text);
  }

  /**
   * Output information about an error that happened.
   *
   * @param task - What we were trying to do at the time.
   * @param problem - The error itself.
   */
  function outputError(task: string, problem: unknown): void {
    if (problem) {
      const realProblem: Error = problem as Error; // to make eslint stfu
      outputLine(`error ${task}: ${realProblem}`);
    } else {
      outputLine(`error ${task}`);
    }
  }

  /**
   * Act upon a message received from another network node.
   *
   * @param from - The network node received from.
   * @param message - The message that was received.
   */
  async function receiveMsg(from: string, message: string): Promise<void> {
    outputLine(`${from}:: recv ${message}`);
    await remoteMessageHandler(from, message);
  }

  /**
   * Transmit a message to some other network node.
   *
   * @param targetPeerId - The peerId of the intended message destination.
   * @param message - The message itself.
   * @param hints - Possible addresses at which the target peer might be contacted.
   */
  async function sendRemoteMessage(
    targetPeerId: string,
    message: string,
    hints: string[] = [],
  ): Promise<void> {
    console.log(`libp2p addresses: `, libp2p.getMultiaddrs().map(addr => addr.toString()));
    console.log('libp2p protocols:', libp2p.getProtocols());
    console.log('libp2p properties:', Object.keys(libp2p));
    console.log('libp2p services:', libp2p.services);
    console.log('libp2p components:', Object.keys((libp2p as any).components.components));
    console.log('libp2p transports:', (libp2p as any).components?.transportManager?.getTransports?.());

    let channel = activeChannels.get(targetPeerId);
    if (!channel) {
      try {
        channel = await openChannel(targetPeerId, hints);
      } catch (problem) {
        outputError(`opening connection to ${targetPeerId}`, problem);
      }
      if (!channel) {
        return;
      }
      readChannel(channel).catch((problem) => {
        outputError(`reading channel to ${targetPeerId}`, problem);
      });
    }
    try {
      outputLine(`${targetPeerId}:: send ${message}`);
      await channel.msgStream.write(fromString(message));
    } catch (problem) {
      outputError(`sending message to ${targetPeerId}`, problem);
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
          outputLine(`${channel.peerId}:: remote disconnected`);
        } else {
          outputError(`reading message from ${channel.peerId}`, problem);
        }
        outputLine(`closed channel to ${channel.peerId}`);
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
   * @param hints - Possible addresses at which the peer might be contacted.
   *
   * @returns a Channel to `peerId`.
   */
  async function openChannel(peerId: string, hints: string[] = []): Promise<Channel> {
    outputLine(`connecting to ${peerId}`);
    const signal = AbortSignal.timeout(5000000);
    // try the hints first, followed by any known relays that aren't already in the hints
    const possibleContacts = hints.concat();
    for (const known of knownRelays) {
      // n.b., yes, this is an N^2 algorithm, but I think it should be OK
      // because `hints` and `knownRelays` should generally both be very short
      // (I'm guessing fewer than 3 entries each in the typical case).  Note
      // also that we append to the list, so that addresses in the hints array
      // will be tried first.
      if (possibleContacts.indexOf(known) < 0) {
        possibleContacts.push(known);
      }
    }

    let stream;
    for (const trial of possibleContacts) {
      const addressString = `${trial}/p2p-circuit/webrtc/p2p/${peerId}`;
      const connectToAddr: Multiaddr = multiaddr(addressString);
      try {
        outputLine(`attempting to contact ${peerId} via ${trial}`);
        const conn = await libp2p.dial(connectToAddr, {
          signal,
          runOnTransientConnection: true, // Allow transient connections
        } as unknown as DialOptions);
        stream = await conn.newStream('whatever');
        //stream = await libp2p.dialProtocol(connectToAddr, 'whatever', {
        //  signal,
        //  runOnTransientConnection: true, // Allow transient connections
        //} as unknown as DialProtocolOptions);
      } catch (problem) {
        if (problem instanceof MuxerClosedError) {
          outputError(`yamux muxer issue contacting ${peerId} via ${trial}`, problem);
          // Continue to try other relays instead of failing immediately
        } else if (signal.aborted) {
          outputError(`timed out opening channel to ${peerId}`, problem);
        } else {
          outputError(`opening channel to ${peerId}`, problem);
        }
      }
      if (stream) {
        break;
      }
    }
    if (!stream) {
      throw Error(`unable to open channel to ${peerId}`);
    }
    const msgStream = byteStream(stream);
    const channel: Channel = { msgStream, peerId };
    activeChannels.set(peerId, channel);
    outputLine(`opened channel to ${peerId}`);
    return channel;
  }

  await libp2p.handle('whatever', ({ connection, stream }) => {
    const msgStream = byteStream(stream);
    const remotePeerId = connection.remotePeer.toString();
    outputLine(`inbound connection from peerId:${remotePeerId}`);
    const channel: Channel = { msgStream, peerId: remotePeerId };
    activeChannels.set(remotePeerId, channel);
    readChannel(channel).catch(() => {
      /* Nothing to do here. */
    });
  });

  await libp2p.start();
  outputLine(`libp2p started with peer ID: ${libp2p.peerId.toString()}`);

  return sendRemoteMessage;
}
