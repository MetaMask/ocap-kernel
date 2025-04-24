import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { autoNAT } from '@libp2p/autonat';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import type { PeerId } from '@libp2p/interface';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { createLibp2p } from 'libp2p';

import { generatePeerId } from './key-manglage.ts';

const RELAY_LOCAL_ID = 200;

/**
 * Main.
 */
async function main(): Promise<void> {
  const peerId: PeerId = (await generatePeerId(
    RELAY_LOCAL_ID,
  )) as unknown as PeerId;
  const libp2p = await createLibp2p({
    peerId,
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/9001/ws', '/ip4/0.0.0.0/tcp/9002'],
    },
    transports: [webSockets(), tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      // Allow private addresses for local testing
      denyDialMultiaddr: async () => false,
    },
    services: {
      identify: identify(),
      autoNat: autoNAT(),
      relay: circuitRelayServer(),
    },
  });

  console.log('PeerID: ', libp2p.peerId.toString());
  console.log('Multiaddrs: ', libp2p.getMultiaddrs());
}

main().catch(() => {
  /* do nothing on error; it's a PoC */
});
