import { is } from '@metamask/superstruct';
import { describe, it, expect } from 'vitest';

import { Libp2pNetlayerConfigStruct } from './config.ts';

describe('Libp2pNetlayerConfigStruct', () => {
  it('accepts an empty config', () => {
    expect(is({}, Libp2pNetlayerConfigStruct)).toBe(true);
  });

  it('accepts a fully-specified config', () => {
    const config = {
      knownRelays: ['/ip4/127.0.0.1/tcp/9001/ws/p2p/relay'],
      maxRetryAttempts: 0,
      maxConcurrentConnections: 100,
      maxMessageSizeBytes: 1024,
      cleanupIntervalMs: 1000,
      stalePeerTimeoutMs: 2000,
      maxMessagesPerSecond: 50,
      maxConnectionAttemptsPerMinute: 10,
      reconnectionBaseDelayMs: 500,
      reconnectionMaxDelayMs: 10_000,
      handshakeTimeoutMs: 10_000,
      writeTimeoutMs: 10_000,
      streamInactivityTimeoutMs: 120_000,
      allowedWsHosts: ['relay.example'],
      directListenAddresses: ['/ip4/0.0.0.0/udp/0/quic-v1'],
    };
    expect(is(config, Libp2pNetlayerConfigStruct)).toBe(true);
  });

  it.each([
    { name: 'non-integer maxRetryAttempts', config: { maxRetryAttempts: 1.5 } },
    { name: 'negative maxRetryAttempts', config: { maxRetryAttempts: -1 } },
    {
      name: 'zero maxConcurrentConnections',
      config: { maxConcurrentConnections: 0 },
    },
    { name: 'zero maxMessageSizeBytes', config: { maxMessageSizeBytes: 0 } },
    { name: 'non-string knownRelays', config: { knownRelays: [1, 2] } },
    { name: 'string knownRelays', config: { knownRelays: 'relay' } },
    { name: 'non-array allowedWsHosts', config: { allowedWsHosts: 'host' } },
  ])('rejects a config with $name', ({ config }) => {
    expect(is(config, Libp2pNetlayerConfigStruct)).toBe(false);
  });
});
