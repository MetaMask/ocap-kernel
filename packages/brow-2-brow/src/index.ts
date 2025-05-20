import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import type {
  PeerId,
  Connection,
  Libp2p,
  Libp2pEvents,
  PrivateKey,
} from '@libp2p/interface';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { webTransport } from '@libp2p/webtransport';
import { multiaddr } from '@multiformats/multiaddr';
import type { ByteStream } from 'it-byte-stream';
import { byteStream } from 'it-byte-stream';
import { createLibp2p } from 'libp2p';
import { toString as bufToString, fromString } from 'uint8arrays';

import { generateKeyPair } from './key-manglage.ts';
import { update, getPeerTypes, getAddresses, getPeerDetails } from './utils.ts';

// Our eslint rules have a hard time understanding that this is not Node code
/* eslint-disable n/no-unsupported-features/node-builtins */

const RELAY_ID = 200;
const RELAY_HOST = '/dns4/troll.fudco.com';

type Channel = {
  msgStream: ByteStream;
  id: number;
};

declare global {
  // TypeScript requires you to use `var` here for these declarations to work.
  // eslint-disable-next-line no-var
  var libp2p: Libp2p;
  // eslint-disable-next-line no-var
  var location: Location;
  // eslint-disable-next-line no-var
  var document: Document;
}

const App = async (): Promise<void> => {
  const peerIdList: (PeerId | undefined)[] = []; // id -> peerID
  const keyList: (PrivateKey | undefined)[] = []; // id -> private key
  const idMap = new Map<string, number>(); // peerID string -> id
  peerIdList[0] = undefined;
  for (let i = 1; i < 256; ++i) {
    const keyPair = await generateKeyPair(i);
    keyList[i] = keyPair;
    const peerId = peerIdFromPrivateKey(keyPair);
    peerIdList[i] = peerId;
    idMap.set(peerId.toString(), i);
  }

  const activeChannels = new Map(); // peerID -> channel info
  const queryParams = new URLSearchParams(location.search);
  const idParam = queryParams.get('id');
  // Nullish coalescing does the wrong thing here; the eslint rule is bad
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  let localId = (idParam && Number.parseInt(idParam, 10)) || 0;
  if (localId < 1 || localId > 255) {
    localId = 0;
  }
  const showEvents = queryParams.get('events');
  const showPeerTypes = queryParams.get('peertypes');
  const showAddresses = queryParams.get('addresses');
  const peerId = peerIdList[localId] as unknown as PeerId;
  const privateKey = keyList[localId] as unknown as PrivateKey;
  console.log(`I am id:${localId} peerId:${peerId.toString()}`);

  const relayPeerId = peerIdList[RELAY_ID];
  if (!relayPeerId) {
    throw Error(`relay peer ID is undefined`);
  }
  const relayAddr = `${RELAY_HOST}/tcp/9001/ws/p2p/${relayPeerId.toString()}`;

  const libp2p = await createLibp2p({
    privateKey,
    addresses: {
      listen: [
        // Both webRTC and p2p-circuit are needed for inbound hole punching to actually work
        '/webrtc',
        '/p2p-circuit',
      ],
      announce: ['/webrtc'],
    },
    transports: [
      webSockets(),
      webTransport(),
      webRTC(),
      // Required to create circuit relay reservations in order to hole punch browser-to-browser WebRTC connections
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
        list: [relayAddr],
      }),
    ],
    services: {
      identify: identify(),
    },
  });

  globalThis.libp2p = libp2p;

  const DOM = {
    nodePeerId: () => document.getElementById('output-node-peer-id'),
    nodeStatus: () => document.getElementById('output-node-status'),
    nodePeerCount: () => document.getElementById('output-peer-count'),
    nodePeerTypes: () => document.getElementById('output-peer-types'),
    nodeAddressCount: () => document.getElementById('output-address-count'),
    nodeAddresses: () => document.getElementById('output-addresses'),
    nodePeerDetails: () => document.getElementById('output-peer-details'),

    inputMultiaddr: () => document.getElementById('input-multiaddr'),
    inputTarget: () => document.getElementById('input-target'),
    inputMessage: () => document.getElementById('input-message'),
    connectButton: () => document.getElementById('button-connect'),
    sendButton: () => document.getElementById('button-send'),
    outputMessages: () => document.getElementById('output-messages'),
  };

  outputLine(`I am id:${localId} peerId:${peerId.toString()}`);

  update(DOM.nodePeerId(), libp2p.peerId.toString());
  update(DOM.nodeStatus(), 'Online');

  /**
   * Output a line of text to the display.
   *
   * @param text - The text to output.
   */
  function outputLine(text: string): void {
    const line = document.createElement('div');
    line.setAttribute('class', 'text-sm break-all');
    line.appendChild(document.createTextNode(text));
    DOM.outputMessages().append(line);
  }

  /**
   * Output text about an event, if that behavior is turned on.
   *
   * @param desc - Descriptive text to output.
   */
  function outputEvent(desc: string): void {
    if (showEvents) {
      outputLine(`#### ${desc}`);
    }
  }

  /**
   * Output a message that was received.
   *
   * @param id - The network node the message came from.
   * @param message - The message itself.
   */
  function outputMsg(id: number, message: string): void {
    outputLine(`${id}:: '${message}'`);
  }

  /**
   * Output information about an error that happened.
   *
   * @param id - The network node the error was associated with.
   * @param task - What we were trying to do at the time.
   * @param problem - The error itself.
   */
  function outputError(id: number, task: string, problem: unknown): void {
    if (problem) {
      const realProblem: Error = problem as Error; // to make eslint stfu
      outputLine(`${id}:: error ${task}: ${realProblem}`);
    } else {
      outputLine(`${id}:: error ${task}`);
    }
  }

  /**
   * Output information about a libp2p event that happened.
   *
   * @param type - The event type.
   * @param event - The event itself.
   */
  function logEvent(type: string, event: CustomEvent): void {
    switch (type) {
      case 'certificate:provision':
      case 'certificate:renew': {
        const cert = event.detail;
        outputEvent(`${type}: cert=${cert.cert} key=${cert.key}`);
        break;
      }
      case 'connection:close':
      case 'connection:open': {
        const conn = event.detail;
        outputEvent(
          `${type}: id=${conn.id} dir=${conn.direction} remote=${conn.remotePeer} addr=${conn.remoteAddr} status=${conn.status}`,
        );
        break;
      }
      case 'connection:prune': {
        const conns = event.detail;
        outputEvent(
          `${type}: ids=[${conns.map((conn: Connection) => conn.id).join(',')}]`,
        );
        break;
      }
      case 'peer:connect':
      case 'peer:disconnect':
      case 'peer:reconnect-failure':
        outputEvent(`${type}: ${event.detail}`);
        break;
      case 'peer:discovery': {
        const peerInfo = event.detail;
        outputEvent(
          `${type}: ${peerInfo.id} [${peerInfo.multiaddrs.join(',')}]`,
        );
        break;
      }
      case 'peer:identify': {
        const ir = event.detail;
        outputEvent(`${type}: conn=${ir.connection.id} peer=${ir.peerId}`);
        break;
      }
      case 'peer:update':
      case 'self:peer:update': {
        const pu = event.detail;
        outputEvent(`${type}: peer=${pu.peer.id} previous=${pu.previous?.id}`);
        break;
      }
      case 'start':
      case 'stop':
      case 'transport:close':
      case 'transport:listening':
        outputEvent(`${type}`);
        break;
      default:
        outputEvent(`${type}: unknown event ${JSON.stringify(event.detail)}`);
        break;
    }
  }

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
  if (showEvents) {
    for (const et of eventTypes) {
      libp2p.addEventListener(et as keyof Libp2pEvents, (event) =>
        logEvent(et, event),
      );
    }
  }

  setInterval(() => {
    update(DOM.nodePeerCount(), String(libp2p.getConnections().length));
    if (showPeerTypes) {
      update(DOM.nodePeerTypes(), getPeerTypes(libp2p));
    }
    update(DOM.nodeAddressCount(), String(libp2p.getMultiaddrs().length));
    if (showAddresses) {
      update(DOM.nodeAddresses(), getAddresses(libp2p));
    }
    update(DOM.nodePeerDetails(), getPeerDetails(libp2p));
  }, 1000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DOM.connectButton().onclick = async (event: any) => {
    event.preventDefault();
    const maddr = multiaddr(DOM.inputMultiaddr().value);

    outputLine(`connect to ${maddr.toString()}`);
    try {
      await libp2p.dial(maddr);
    } catch (problem) {
      outputLine(
        `error connecting to ${maddr.toString()}: ${(problem as Error).toString()}`,
      );
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DOM.sendButton().onclick = async (event: any) => {
    event.preventDefault();
    const target = DOM.inputTarget().value;
    const message = DOM.inputMessage().value;
    console.log(`send to ${target}: '${message}'`);
    await sendMsg(Number(target), message);
  };

  /**
   * Act upon a message received from another network node.
   *
   * @param id - The network node received from.
   * @param message - The message that was received.
   */
  function receiveMsg(id: number, message: string): void {
    outputMsg(id, message);
  }

  /**
   * Send a message to another network node, opening a Channel to it if necessary.
   *
   * @param id - The network node to send to.
   * @param message - The message to send.
   */
  async function sendMsg(id: number, message: string): Promise<void> {
    let channel: Channel = activeChannels.get(id);
    if (!channel) {
      try {
        channel = await openChannel(id);
      } catch (problem) {
        outputError(id, 'opening connection', problem);
        return;
      }
      readChannel(channel).catch((problem) => {
        outputError(id, 'reading channel', problem);
      });
    }
    try {
      await channel.msgStream.write(fromString(message));
    } catch (problem) {
      outputError(id, 'sending message', problem);
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
          outputLine(`${channel.id}:: remote disconnected`);
        } else {
          outputError(channel.id, 'reading message', problem);
        }
        throw problem;
      }
      if (readBuf) {
        receiveMsg(channel.id, bufToString(readBuf.subarray()));
      }
    }
  }

  /**
   * Open a channel to the node with the given id.
   *
   * @param id - The network node to connect to.
   *
   * @returns a Channel to `id`.
   */
  async function openChannel(id: number): Promise<Channel> {
    const targetPeerId = peerIdList[id];
    if (!targetPeerId) {
      throw Error(`no peer ID for id = ${id}`);
    }
    outputLine(`connecting to id:${id} peerId:${targetPeerId.toString()}`);
    const signal = AbortSignal.timeout(500000);
    const addressString = `${relayAddr}/p2p-circuit/webrtc/p2p/${targetPeerId.toString()}`;
    outputLine(`dial address ${addressString}`);
    const connectToAddr = multiaddr(addressString);

    let stream;
    try {
      stream = await libp2p.dialProtocol(connectToAddr, 'whatever', { signal });
    } catch (problem) {
      if (signal.aborted) {
        outputError(
          id,
          `timed out opening channel to ${targetPeerId.toString()}`,
          problem,
        );
      } else {
        outputError(
          id,
          `opening channel to ${targetPeerId.toString()}`,
          problem,
        );
      }
      throw problem;
    }
    const msgStream = byteStream(stream);
    const channel = { msgStream, id };
    activeChannels.set(targetPeerId, channel);
    return channel;
  }

  await libp2p.handle('whatever', ({ connection, stream }) => {
    const msgStream = byteStream(stream);
    const remotePeerId = connection.remotePeer;
    const id = idMap.get(peerId.toString()) ?? -1;
    outputLine(
      `inbound connection from id:${id} peerId:${remotePeerId.toString()}`,
    );
    const channel = { msgStream, id };
    activeChannels.set(remotePeerId, channel);
    readChannel(channel).catch(() => {
      /* Nothing to do here. */
    });
  });
};

App().catch((problem) => {
  console.error(problem);
});
