import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { autoNAT } from '@libp2p/autonat';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { createLibp2p } from 'libp2p';

import { generateKeyPair } from './key-manglage.ts';

const RELAY_OFFSET = 200; // for historical reasons, don't ask

/**
 * Main.
 */
async function main(): Promise<void> {
  const localId = process.argv.length > 2 ? Number(process.argv[2]) : 0;
  const privateKey = await generateKeyPair(localId + RELAY_OFFSET);
  const port = 9001 + localId * 2;

  const libp2p = await createLibp2p({
    privateKey,
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${port}/ws`, `/ip4/0.0.0.0/tcp/${port + 1}`],
    },
    transports: [webSockets(), tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      // Allow private addresses for local testing
      denyDialMultiaddr: async () => false,
    },
    services: {
      identify: identify(),
      autoNat: autoNAT(),
      relay: circuitRelayServer(),
      ping: ping(),
    },
  });

  // TODO(#562): Use logger instead.
  // eslint-disable-next-line no-console
  console.log('PeerID: ', libp2p.peerId.toString());
  // TODO(#562): Use logger instead.
  // eslint-disable-next-line no-console
  console.log('Multiaddrs: ', libp2p.getMultiaddrs());
  // eslint-disable-next-line no-console
  console.log('Protocols: ', libp2p.getProtocols());
}

main().catch(() => {
  /* do nothing on error; it's a PoC */
});
