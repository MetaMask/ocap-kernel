import { multiaddr } from '@multiformats/multiaddr';
import { describe, it, expect } from 'vitest';

import { getHost, getLastPeerId, isPlainWs } from './multiaddr.ts';

describe('getLastPeerId', () => {
  it.each([
    {
      desc: 'simple address with one /p2p/ segment',
      addr: '/ip4/127.0.0.1/tcp/9001/ws/p2p/12D3KooWTest',
      expected: '12D3KooWTest',
    },
    {
      desc: 'circuit relay address returns target, not relay',
      addr: '/dns4/relay.example/tcp/443/wss/p2p/12D3KooWRelay/p2p-circuit/webrtc/p2p/12D3KooWTarget',
      expected: '12D3KooWTarget',
    },
    {
      desc: 'address without /p2p/ segment',
      addr: '/ip4/127.0.0.1/tcp/9001/ws',
      expected: undefined,
    },
  ])('$desc', ({ addr, expected }) => {
    expect(getLastPeerId(multiaddr(addr))).toBe(expected);
  });
});

describe('getHost', () => {
  it.each([
    {
      desc: 'extracts IPv4 host',
      addr: '/ip4/192.168.1.1/tcp/9001/ws',
      expected: '192.168.1.1',
    },
    {
      desc: 'extracts dns4 host',
      addr: '/dns4/relay.example.com/tcp/443/wss',
      expected: 'relay.example.com',
    },
    {
      desc: 'extracts IPv6 host',
      addr: '/ip6/::1/tcp/9001/ws',
      expected: '::1',
    },
    {
      desc: 'extracts dns6 host',
      addr: '/dns6/relay.example.com/tcp/443/wss',
      expected: 'relay.example.com',
    },
    {
      desc: 'returns undefined for address without host component',
      addr: '/p2p-circuit/webrtc/p2p/12D3KooWTest',
      expected: undefined,
    },
  ])('$desc', ({ addr, expected }) => {
    expect(getHost(multiaddr(addr))).toBe(expected);
  });
});

describe('isPlainWs', () => {
  it.each([
    { desc: 'plain ws://', addr: '/ip4/127.0.0.1/tcp/9001/ws', expected: true },
    {
      desc: 'secure wss://',
      addr: '/ip4/127.0.0.1/tcp/443/wss',
      expected: false,
    },
    {
      desc: 'ws with tls',
      addr: '/ip4/127.0.0.1/tcp/443/tls/ws',
      expected: false,
    },
    {
      desc: 'webrtc (no ws)',
      addr: '/ip4/127.0.0.1/udp/9001/webrtc',
      expected: false,
    },
    {
      desc: 'plain tcp (no ws)',
      addr: '/ip4/127.0.0.1/tcp/9001',
      expected: false,
    },
  ])('$desc → $expected', ({ addr, expected }) => {
    expect(isPlainWs(multiaddr(addr))).toBe(expected);
  });
});
