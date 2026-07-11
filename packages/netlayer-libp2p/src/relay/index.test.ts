import { describe, it, expect, vi, beforeEach } from 'vitest';

import { startRelay } from './index.ts';

const createLibp2pMock = vi.fn();

vi.mock('@chainsafe/libp2p-noise', () => ({ noise: () => ({}) }));
vi.mock('@chainsafe/libp2p-yamux', () => ({ yamux: () => ({}) }));
vi.mock('@libp2p/autonat', () => ({ autoNAT: () => ({}) }));
vi.mock('@libp2p/circuit-relay-v2', () => ({ circuitRelayServer: () => ({}) }));
vi.mock('@libp2p/crypto/keys', () => ({
  generateKeyPairFromSeed: async () => ({ type: 'Ed25519' }),
}));
vi.mock('@libp2p/identify', () => ({ identify: () => ({}) }));
vi.mock('@libp2p/ping', () => ({ ping: () => ({}) }));
vi.mock('@libp2p/tcp', () => ({ tcp: () => ({}) }));
vi.mock('@libp2p/websockets', () => ({ webSockets: () => ({}) }));
vi.mock('libp2p', () => ({
  createLibp2p: (config: unknown) => createLibp2pMock(config),
}));

type Handler = (evt: { detail: unknown }) => void;

const makeFakeLibp2p = (): {
  status: string;
  peerId: { toString: () => string };
  getMultiaddrs: () => { toString: () => string }[];
  addEventListener: ReturnType<typeof vi.fn>;
  handlers: Record<string, Handler>;
} => {
  const handlers: Record<string, Handler> = {};
  return {
    status: 'started',
    peerId: { toString: () => '12D3KooWRelay' },
    getMultiaddrs: () => [{ toString: () => '/ip4/0.0.0.0/tcp/9001/ws' }],
    addEventListener: vi.fn((event: string, handler: Handler) => {
      handlers[event] = handler;
    }),
    handlers,
  };
};

const makeConnection = (peerId: string, addr: string): { detail: unknown } => ({
  detail: {
    remotePeer: { toString: () => peerId },
    remoteAddr: { toString: () => addr },
  },
});

describe('startRelay', () => {
  beforeEach(() => {
    createLibp2pMock.mockReset();
  });

  it('creates and returns a started libp2p relay node', async () => {
    const fake = makeFakeLibp2p();
    createLibp2pMock.mockReturnValue(fake);
    const logger = { log: vi.fn() };

    const result = await startRelay(logger);

    expect(result).toBe(fake);
    expect(createLibp2pMock).toHaveBeenCalledTimes(1);
    const [config] = createLibp2pMock.mock.calls[0] as [
      { addresses: { listen: string[]; appendAnnounce: string[] } },
    ];
    expect(config.addresses.listen).toStrictEqual([
      '/ip4/0.0.0.0/tcp/9001/ws',
      '/ip4/0.0.0.0/tcp/9002',
    ]);
    expect(config.addresses.appendAnnounce).toStrictEqual([]);
    expect(logger.log).toHaveBeenCalledWith('PeerID: ', '12D3KooWRelay');
  });

  it('logs connection open and close events with terse peer labels', async () => {
    const fake = makeFakeLibp2p();
    createLibp2pMock.mockReturnValue(fake);
    const logger = { log: vi.fn() };
    await startRelay(logger);

    const open = fake.handlers['connection:open'];
    const close = fake.handlers['connection:close'];
    const conn = makeConnection(
      '12D3KooWpeerA',
      '/ip4/1.2.3.4/tcp/9001/ws/p2p/12D3KooWpeerA',
    );
    // Fire open twice to exercise the terse-peer cache, then close.
    open?.(conn);
    open?.(conn);
    close?.(conn);

    // First sighting assigns and logs a terse label for the peer.
    expect(logger.log).toHaveBeenCalledWith('[PEER] <PEER-1> = 12D3KooWpeerA');
    expect(logger.log).toHaveBeenCalledWith(
      '[CONNECTION] Closed connection with <PEER-1>',
    );
  });

  it('announces the public IP addresses when provided', async () => {
    createLibp2pMock.mockReturnValue(makeFakeLibp2p());
    const logger = { log: vi.fn() };

    await startRelay(logger, { publicIp: '203.0.113.7' });

    const [config] = createLibp2pMock.mock.calls[0] as [
      { addresses: { appendAnnounce: string[] } },
    ];
    expect(config.addresses.appendAnnounce).toStrictEqual([
      '/ip4/203.0.113.7/tcp/9001/ws',
      '/ip4/203.0.113.7/tcp/9002',
    ]);
  });

  it('waits for the start event when the node is not yet started', async () => {
    const fake = makeFakeLibp2p();
    fake.status = 'starting';
    createLibp2pMock.mockReturnValue(fake);

    const promise = startRelay({ log: vi.fn() });
    // Let startRelay progress to registering its 'start' listener, then fire it.
    await new Promise((resolve) => setImmediate(resolve));
    fake.handlers.start?.({ detail: undefined });
    expect(await promise).toBe(fake);
  });
});
