import { describe, it, expect } from 'vitest';

import { isPrivateAddress } from './network.ts';

describe('isPrivateAddress', () => {
  it.each([
    // IPv4 loopback (127.0.0.0/8)
    { host: '127.0.0.1', expected: true },
    { host: '127.255.255.255', expected: true },

    // IPv4 private (10.0.0.0/8)
    { host: '10.0.0.1', expected: true },
    { host: '10.255.255.255', expected: true },

    // IPv4 private (172.16.0.0/12)
    { host: '172.16.0.1', expected: true },
    { host: '172.31.255.255', expected: true },
    { host: '172.15.0.1', expected: false },
    { host: '172.32.0.1', expected: false },

    // IPv4 private (192.168.0.0/16)
    { host: '192.168.0.1', expected: true },
    { host: '192.168.255.255', expected: true },
    { host: '192.169.0.1', expected: false },

    // IPv4 public
    { host: '8.8.8.8', expected: false },
    { host: '1.1.1.1', expected: false },

    // localhost
    { host: 'localhost', expected: true },

    // IPv6 loopback
    { host: '::1', expected: true },

    // IPv6 unique-local (fc00::/7)
    { host: 'fc00::1', expected: true },
    { host: 'fd12:3456:789a::1', expected: true },

    // IPv6 link-local (fe80::/10)
    { host: 'fe80::1', expected: true },

    // IPv6 public
    { host: '2001:db8::1', expected: false },

    // DNS hostnames
    { host: 'relay.example.com', expected: false },
    { host: 'google.com', expected: false },

    // Invalid IPv4 (octets > 255)
    { host: '256.0.0.1', expected: false },
  ])('isPrivateAddress("$host") → $expected', ({ host, expected }) => {
    expect(isPrivateAddress(host)).toBe(expected);
  });
});
