import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { autoNAT } from '@libp2p/autonat';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { identify } from '@libp2p/identify';
import type { Libp2p, PrivateKey } from '@libp2p/interface';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import type { Logger } from '@metamask/logger';
import { createLibp2p } from 'libp2p';

/**
 * Fixed local ID for the relay server.
 * This ensures the relay server always has the same PeerID across restarts,
 * making it easier for clients to connect to a known relay address.
 * The ID must be between 1-255 to generate a deterministic keypair.
 */
const RELAY_LOCAL_ID = 200;

/**
 * Start the relay server.
 *
 * @param logger - The logger to use.
 * @returns The libp2p instance.
 */
export async function startRelay(logger: Logger | Console): Promise<Libp2p> {
  const privateKey = await generateKeyPair(RELAY_LOCAL_ID);
  const libp2p = await createLibp2p({
    privateKey,
    addresses: {
      listen: [
        '/ip4/0.0.0.0/tcp/9001/ws', // WebSocket for browser connections
        '/ip4/0.0.0.0/tcp/9002', // TCP for server-to-server
      ],
    },
    transports: [
      webSockets(), // Required for browser connections
      tcp(), // Optional for server connections
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      // Allow private addresses for local testing
      denyDialMultiaddr: async () => false,
    },
    services: {
      identify: identify(),
      autoNat: autoNAT(),
      relay: circuitRelayServer({
        // Allow unlimited reservations for testing
        reservations: {
          maxReservations: Infinity,
        },
      }),
    },
  });

  // Register the protocol handler that the kernel uses
  await libp2p.handle('whatever', ({ stream, connection }) => {
    logger.log(
      `[PROTOCOL] Incoming 'whatever' protocol from ${connection.remotePeer.toString()}`,
    );
    // For relay purposes, we don't need to do anything special
    // The relay will forward the stream automatically
    stream
      .close()
      .then(() => {
        return undefined;
      })
      .catch(() => {
        // Ignore close errors - relay will handle cleanup
        return undefined;
      });
  });

  // Set up connection event listeners for logging
  libp2p.addEventListener('connection:open', (evt) => {
    const connection = evt.detail;
    logger.log(
      `[CONNECTION] New connection from ${connection.remotePeer.toString()}`,
    );
    logger.log(`  Remote addr: ${connection.remoteAddr.toString()}`);
    logger.log(`  Direction: ${connection.direction}`);
    logger.log(`  Status: ${connection.status}`);
  });

  libp2p.addEventListener('connection:close', (evt) => {
    const connection = evt.detail;
    logger.log(
      `[CONNECTION] Closed connection with ${connection.remotePeer.toString()}`,
    );
  });

  // Log peer discovery events
  libp2p.addEventListener('peer:discovery', (evt) => {
    const peerInfo = evt.detail;
    logger.log(`[DISCOVERY] Found peer ${peerInfo.id.toString()}`);
  });

  // Log circuit relay specific events
  if (libp2p.services.relay) {
    // Log when a reservation is made
    libp2p.addEventListener('peer:connect', (evt) => {
      const peerId = evt.detail;
      logger.log(`[RELAY] Peer connected: ${peerId.toString()}`);
    });

    libp2p.addEventListener('peer:disconnect', (evt) => {
      const peerId = evt.detail;
      logger.log(`[RELAY] Peer disconnected: ${peerId.toString()}`);
    });
  }

  await new Promise<void>((resolve) => {
    if (libp2p.status === 'started') {
      resolve();
    } else {
      libp2p.addEventListener('start', resolve);
    }
  });

  logger.log('========================================');
  logger.log('Relay Server Started');
  logger.log('PeerID: ', libp2p.peerId.toString());
  logger.log('Multiaddrs: ', libp2p.getMultiaddrs());
  logger.log('========================================');

  return libp2p;
}

/**
 * Generate the private key for a given localID.
 *
 * @param localId - The localID whose peerID is sought.
 *
 * @returns the private key for `localID`.
 */
async function generateKeyPair(
  localId: number | undefined,
): Promise<PrivateKey> {
  let seed;
  // eslint-disable-next-line no-negated-condition
  if (localId !== undefined) {
    if (localId < 1 || localId > 255) {
      throw new Error(`localId must be a Uint8 1<=255. Received: ${localId}`);
    }

    seed = new Uint8Array(32);
    seed[0] = localId;
  } else {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    seed = globalThis.crypto.getRandomValues(new Uint8Array(32));
  }
  return await generateKeyPairFromSeed('Ed25519', seed);
}
