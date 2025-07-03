import type { Libp2p } from '@libp2p/interface';
import { protocols } from '@multiformats/multiaddr';
import {
  WebRTC,
  WebSockets,
  WebSocketsSecure,
  WebTransport,
  Circuit,
} from '@multiformats/multiaddr-matcher';

import { bootstrapPeers } from './constants.ts';

/**
 * Fetch info about our own known addresses.
 *
 * @param libp2p - The libp2p object managing all the libp2p stuff.
 *
 * @returns HTML text for displaying our known addresses.
 */
export function getAddresses(libp2p: Libp2p): string {
  return libp2p
    .getMultiaddrs()
    .map((ma) => {
      return `<li class="text-sm break-all"><button class="bg-teal-500 hover:bg-teal-700 text-white mx-2" onclick="navigator.clipboard.writeText('${ma.toString()}')">Copy</button>${ma.toString()}</li>`;
    })
    .join('');
}

/**
 * Fetch info about known peer types.
 *
 * @param libp2p - The libp2p object managing all the libp2p stuff.
 *
 * @returns HTML text for displaying the known peer types.
 */
export function getPeerTypes(libp2p: Libp2p): string {
  const types = {
    'Circuit Relay': 0,
    WebRTC: 0,
    WebSockets: 0,
    'WebSockets (secure)': 0,
    WebTransport: 0,
    Other: 0,
  };

  libp2p
    .getConnections()
    .map((conn) => conn.remoteAddr)
    .forEach((ma) => {
      if (WebRTC.exactMatch(ma) || ma.toString().includes('/webrtc/')) {
        types.WebRTC += 1;
      } else if (WebSockets.exactMatch(ma)) {
        types.WebSockets += 1;
      } else if (WebSocketsSecure.exactMatch(ma)) {
        types['WebSockets (secure)'] += 1;
      } else if (WebTransport.exactMatch(ma)) {
        types.WebTransport += 1;
      } else if (Circuit.exactMatch(ma)) {
        types['Circuit Relay'] += 1;
      } else {
        types.Other += 1;
        // TODO(#562): Use logger instead.
        // eslint-disable-next-line no-console
        console.info('wat', ma.toString());
      }
    });

  return Object.entries(types)
    .map(([name, count]) => `<li>${name}: ${count}</li>`)
    .join('');
}

/**
 * Fetch info about known peers.
 *
 * @param libp2p - The libp2p object managing all the libp2p stuff.
 *
 * @returns HTML text for displaying the known peers.
 */
export function getPeerDetails(libp2p: Libp2p): string {
  return libp2p
    .getPeers()
    .map((peer) => {
      const peerConnections = libp2p.getConnections(peer);

      const nodeType = [];

      // detect if this is a bootstrap node
      if (bootstrapPeers.includes(peer.toString())) {
        nodeType.push('bootstrap');
      }

      const relayMultiaddrs = libp2p
        .getMultiaddrs()
        .filter((ma) => Circuit.exactMatch(ma));
      const relayPeers = relayMultiaddrs.map((ma) => {
        return ma
          .stringTuples()
          .filter(([name, _]) => name === protocols('p2p').code)
          .map(([_, value]) => value)[0];
      });

      // detect if this is a relay we have a reservation on
      if (relayPeers.includes(peer.toString())) {
        nodeType.push('relay');
      }

      return `<li>
      <span><code>${peer.toString()}</code>${nodeType.length > 0 ? `(${nodeType.join(', ')})` : ''}</span>
      <ul class="pl-6">${peerConnections
        .map((conn) => {
          return `<li class="break-all text-sm"><button class="bg-teal-500 hover:bg-teal-700 text-white px-2 mx-2 rounded focus:outline-none focus:shadow-outline" onclick="navigator.clipboard.writeText('${conn.remoteAddr.toString()}')">Copy</button>${conn.remoteAddr.toString()} </li>`;
        })
        .join('')}</ul>
    </li>`;
    })
    .join('');
}

/**
 * Update the value of an HTML data element on the page.
 *
 * @param element - The element to update.
 * @param newContent - The new value to update it to.
 */
export function update(element: HTMLDataElement, newContent: string): void {
  if (element.innerHTML !== newContent) {
    element.innerHTML = newContent;
  }
}
