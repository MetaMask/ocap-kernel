import { describe, it, expect, vi } from 'vitest';

import { buildDirectTransports } from './direct-transports.ts';

vi.mock('@chainsafe/libp2p-quic', () => ({
  quic: () => ({ tag: 'quic' }),
}));
vi.mock('@libp2p/tcp', () => ({
  tcp: () => ({ tag: 'tcp' }),
}));

describe('buildDirectTransports', () => {
  it('returns an empty array when given no addresses', () => {
    expect(buildDirectTransports([])).toStrictEqual([]);
  });

  it('builds a QUIC transport for a /quic-v1 address', () => {
    expect(buildDirectTransports(['/ip4/0.0.0.0/udp/0/quic-v1'])).toStrictEqual(
      [
        {
          transport: { tag: 'quic' },
          listenAddresses: ['/ip4/0.0.0.0/udp/0/quic-v1'],
        },
      ],
    );
  });

  it('builds a TCP transport for a /tcp/ address', () => {
    expect(buildDirectTransports(['/ip4/0.0.0.0/tcp/4001'])).toStrictEqual([
      { transport: { tag: 'tcp' }, listenAddresses: ['/ip4/0.0.0.0/tcp/4001'] },
    ]);
  });

  it('groups QUIC and TCP addresses into separate transports', () => {
    const result = buildDirectTransports([
      '/ip4/0.0.0.0/udp/0/quic-v1',
      '/ip4/0.0.0.0/udp/1/quic-v1',
      '/ip4/0.0.0.0/tcp/4001',
    ]);
    expect(result).toStrictEqual([
      {
        transport: { tag: 'quic' },
        listenAddresses: [
          '/ip4/0.0.0.0/udp/0/quic-v1',
          '/ip4/0.0.0.0/udp/1/quic-v1',
        ],
      },
      { transport: { tag: 'tcp' }, listenAddresses: ['/ip4/0.0.0.0/tcp/4001'] },
    ]);
  });

  it('throws for an unsupported direct listen address', () => {
    expect(() => buildDirectTransports(['/ip4/0.0.0.0/ws'])).toThrow(
      'Unsupported direct listen address',
    );
  });
});
