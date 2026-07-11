import { quic } from '@chainsafe/libp2p-quic';
import { tcp } from '@libp2p/tcp';

import type { DirectTransport } from '../types.ts';

/**
 * Build direct (non-relay) libp2p transports from a list of listen addresses,
 * sniffing the required transport from each address string: `/quic-v1` →
 * `quic()`, `/tcp/` → `tcp()`. Callers never import transport packages.
 *
 * @param directListenAddresses - Listen address strings (e.g.
 * `/ip4/0.0.0.0/udp/0/quic-v1`, `/ip4/0.0.0.0/tcp/4001`).
 * @returns The direct transports bundled with their listen addresses.
 * @throws If an address is neither a QUIC nor TCP address.
 */
export function buildDirectTransports(
  directListenAddresses: string[],
): DirectTransport[] {
  const directTransports: DirectTransport[] = [];

  if (directListenAddresses.length === 0) {
    return directTransports;
  }

  const quicAddresses: string[] = [];
  const tcpAddresses: string[] = [];

  for (const addr of directListenAddresses) {
    const isQuic = addr.includes('/quic-v1');
    const isTcp = addr.includes('/tcp/');

    if (isQuic) {
      quicAddresses.push(addr);
    } else if (isTcp) {
      tcpAddresses.push(addr);
    } else {
      throw new Error(
        `Unsupported direct listen address: ${addr}. ` +
          `Only QUIC (/quic-v1) and TCP (/tcp/) addresses are supported.`,
      );
    }
  }

  if (quicAddresses.length > 0) {
    directTransports.push({
      transport: quic(),
      listenAddresses: quicAddresses,
    });
  }

  if (tcpAddresses.length > 0) {
    directTransports.push({
      transport: tcp(),
      listenAddresses: tcpAddresses,
    });
  }

  return directTransports;
}
harden(buildDirectTransports);
