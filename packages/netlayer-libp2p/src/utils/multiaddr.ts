import {
  CODE_P2P,
  CODE_IP4,
  CODE_IP6,
  CODE_DNS4,
  CODE_DNS6,
  CODE_DNSADDR,
} from '@multiformats/multiaddr';
import type { Multiaddr } from '@multiformats/multiaddr';

const HOST_CODES = [CODE_IP4, CODE_IP6, CODE_DNS4, CODE_DNS6, CODE_DNSADDR];

/**
 * Extract the last /p2p/ peer ID from a multiaddr, matching the semantics of
 * the removed `Multiaddr.getPeerId()`. For circuit relay addresses like
 * `/p2p/relay-id/p2p-circuit/webrtc/p2p/target-id`, this returns `target-id`.
 *
 * @param ma - The multiaddr to extract the peer ID from.
 * @returns The peer ID string, or undefined if no /p2p/ component exists.
 */
export function getLastPeerId(ma: Multiaddr): string | undefined {
  let peerId: string | undefined;
  for (const comp of ma.getComponents()) {
    if (comp.code === CODE_P2P) {
      peerId = comp.value;
    }
  }
  return peerId;
}

/**
 * Extract the hostname or IP from a multiaddr (first ip4/ip6/dns component).
 *
 * @param ma - The multiaddr to extract the host from.
 * @returns The host string, or undefined if no host component exists.
 */
export function getHost(ma: Multiaddr): string | undefined {
  return ma.getComponents().find((comp) => HOST_CODES.includes(comp.code))
    ?.value;
}

/**
 * Returns true if the multiaddr uses plain (unencrypted) WebSocket transport.
 *
 * @param ma - The multiaddr to check.
 * @returns True if the multiaddr is a plain ws:// address.
 */
export function isPlainWs(ma: Multiaddr): boolean {
  const names = ma.getComponents().map((comp) => comp.name);
  return (
    names.includes('ws') && !names.includes('wss') && !names.includes('tls')
  );
}
