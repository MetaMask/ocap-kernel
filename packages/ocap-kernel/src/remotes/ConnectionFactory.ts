import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { identify } from '@libp2p/identify';
import { MuxerClosedError } from '@libp2p/interface';
import type { PrivateKey, Libp2p } from '@libp2p/interface';
import { ping } from '@libp2p/ping';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { webTransport } from '@libp2p/webtransport';
import { AbortError, isRetryableNetworkError } from '@metamask/kernel-errors';
import { fromHex, retryWithBackoff } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { multiaddr } from '@multiformats/multiaddr';
import { byteStream } from 'it-byte-stream';
import { createLibp2p } from 'libp2p';

import type { Channel, InboundConnectionHandler } from './types.ts';

/**
 * Connection factory for libp2p network operations.
 * Handles libp2p initialization, dialing, and connection management.
 */
export class ConnectionFactory {
  #libp2p?: Libp2p;

  readonly #inflightDials = new Map<string, Promise<Channel>>();

  readonly #logger: Logger;

  readonly #signal: AbortSignal;

  readonly #knownRelays: string[];

  readonly #keySeed: string;

  #inboundHandler?: InboundConnectionHandler;

  /**
   * Constructor for the ConnectionFactory.
   *
   * @param keySeed - The key seed to use for the libp2p node.
   * @param knownRelays - The known relays to use for the libp2p node.
   * @param logger - The logger to use for the libp2p node.
   * @param signal - The signal to use for the libp2p node.
   */
  constructor(
    keySeed: string,
    knownRelays: string[],
    logger: Logger,
    signal: AbortSignal,
  ) {
    this.#keySeed = keySeed;
    this.#knownRelays = knownRelays;
    this.#logger = logger;
    this.#signal = signal;
  }

  /**
   * Initialize libp2p with the provided configuration.
   */
  async initialize(): Promise<void> {
    const privateKey = await this.#generateKeyInfo();

    this.#libp2p = await createLibp2p({
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
          list: this.#knownRelays,
        }),
      ],
      services: {
        identify: identify(),
        ping: ping(),
      },
    });

    // Set up inbound handler
    await this.#libp2p.handle('whatever', ({ connection, stream }) => {
      const msgStream = byteStream(stream);
      const remotePeerId = connection.remotePeer.toString();
      this.#logger.log(`inbound connection from peerId:${remotePeerId}`);

      const channel: Channel = {
        msgStream,
        peerId: remotePeerId,
        hints: [],
      };

      this.#inboundHandler?.(channel);
    });

    // Start libp2p
    this.#logger.log(
      `Starting libp2p node with peerId: ${this.#libp2p.peerId.toString()}`,
    );
    this.#logger.log(`Connecting to relays: ${this.#knownRelays.join(', ')}`);

    this.#libp2p.addEventListener('self:peer:update', (evt) => {
      this.#logger.log(`Peer update: ${JSON.stringify(evt.detail)}`);
    });

    await this.#libp2p.start();
  }

  /**
   * Set the handler for inbound connections.
   *
   * @param handler - The handler for inbound connections.
   */
  onInboundConnection(handler: InboundConnectionHandler): void {
    this.#inboundHandler = handler;
  }

  /**
   * Generate key info from the seed.
   *
   * @returns The key info.
   */
  async #generateKeyInfo(): Promise<PrivateKey> {
    const keyPair = await generateKeyPairFromSeed(
      'Ed25519',
      fromHex(this.#keySeed),
    );
    return keyPair;
  }

  /**
   * Get candidate address strings for dialing a peer.
   *
   * @param peerId - The peer ID to get candidate address strings for.
   * @param hints - The hints to get candidate address strings for.
   * @returns The candidate address strings.
   */
  candidateAddressStrings(peerId: string, hints: string[]): string[] {
    const possibleContacts = hints.concat(
      ...this.#knownRelays.filter((relay) => !hints.includes(relay)),
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
   * @param hints - The hints to open a channel for.
   * @returns The channel.
   */
  async openChannelOnce(
    peerId: string,
    hints: string[] = [],
  ): Promise<Channel> {
    if (!this.#libp2p) {
      throw new Error('libp2p not initialized');
    }

    const addresses = this.candidateAddressStrings(peerId, hints);
    // Combine shutdown signal with a per-dial timeout
    const signalTimeout = AbortSignal.timeout(30_000);

    let lastError: Error | undefined;

    for (const addressString of addresses) {
      if (this.#signal.aborted) {
        throw new AbortError();
      }
      try {
        const connectToAddr = multiaddr(addressString);
        this.#logger.log(`contacting ${peerId} via ${addressString}`);
        const stream = await this.#libp2p.dialProtocol(
          connectToAddr,
          'whatever',
          {
            signal: signalTimeout,
          },
        );
        this.#logger.log(
          `successfully connected to ${peerId} via ${addressString}`,
        );
        const msgStream = byteStream(stream);
        const channel: Channel = { msgStream, peerId, hints };
        this.#logger.log(`opened channel to ${peerId}`);
        return channel;
      } catch (problem) {
        lastError = problem as Error;
        if (this.#signal.aborted) {
          throw new AbortError();
        }
        if (problem instanceof MuxerClosedError) {
          this.#outputError(
            peerId,
            `yamux muxer issue contacting via ${addressString}`,
            problem,
          );
        } else if (signalTimeout.aborted) {
          this.#outputError(peerId, `timed out opening channel`, problem);
        } else {
          this.#outputError(peerId, `issue opening channel`, problem);
        }
      }
    }

    throw lastError ?? new Error(`unable to open channel to ${peerId}`);
  }

  /**
   * Backoff-capable open (useful for initial connect).
   *
   * @param peerId - The peer ID to open a channel for.
   * @param hints - The hints to open a channel for.
   * @returns The channel.
   */
  async openChannelWithRetry(
    peerId: string,
    hints: string[] = [],
  ): Promise<Channel> {
    return retryWithBackoff(async () => this.openChannelOnce(peerId, hints), {
      jitter: true,
      shouldRetry: isRetryableNetworkError,
      onRetry: ({ attempt, maxAttempts, delayMs }) => {
        this.#logger.log(
          `retrying connection to ${peerId} in ${delayMs}ms (next attempt ${attempt}/${maxAttempts || '∞'})`,
        );
      },
      signal: this.#signal,
    });
  }

  /**
   * Ensure only one dial attempt per peer at a time.
   *
   * @param peerId - The peer ID to dial.
   * @param hints - The hints to dial.
   * @param withRetry - Whether to retry the dial.
   * @returns The channel.
   */
  async dialIdempotent(
    peerId: string,
    hints: string[],
    withRetry: boolean,
  ): Promise<Channel> {
    let promise = this.#inflightDials.get(peerId);
    if (!promise) {
      promise = (
        withRetry
          ? this.openChannelWithRetry(peerId, hints)
          : this.openChannelOnce(peerId, hints)
      ).finally(() => this.#inflightDials.delete(peerId));
      this.#inflightDials.set(peerId, promise);
    }
    return promise;
  }

  /**
   * Output an error message.
   *
   * @param peerId - The peer ID to output an error message for.
   * @param task - The task to output an error message for.
   * @param problem - The problem to output an error message for.
   */
  #outputError(peerId: string, task: string, problem: unknown): void {
    if (problem) {
      const realProblem: Error = problem as Error;
      this.#logger.log(`${peerId}:: error ${task}: ${realProblem}`);
    } else {
      this.#logger.log(`${peerId}:: error ${task}`);
    }
  }

  /**
   * Stop libp2p and clean up.
   *
   * @returns A promise that resolves when libp2p is stopped.
   */
  async stop(): Promise<void> {
    if (this.#libp2p) {
      try {
        await this.#libp2p.stop();
      } catch (error) {
        this.#logger.error('Error while stopping libp2p', error);
      }
    }
    this.#inflightDials.clear();
  }
}
