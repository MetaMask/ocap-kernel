import { describe, expect, it } from 'vitest';

import {
  MEDIATOR_BUNDLE_FILENAME,
  MEDIATOR_SOCKET_CHANNEL,
  MEDIATOR_VAT_NAME,
  makeMediatorClusterConfig,
} from './cluster-config.ts';

describe('makeMediatorClusterConfig', () => {
  it('produces a config with the mediator vat as the bootstrap', () => {
    const config = makeMediatorClusterConfig({
      bundleBaseUrl: 'file:///tmp/mediator',
      socketPath: '/tmp/mediator.sock',
    });
    expect(config.bootstrap).toBe(MEDIATOR_VAT_NAME);
    expect(config.services).toStrictEqual(['ocapURLRedemptionService']);
    expect(config.io?.[MEDIATOR_SOCKET_CHANNEL]).toStrictEqual({
      type: 'socket',
      path: '/tmp/mediator.sock',
    });
    expect(config.vats[MEDIATOR_VAT_NAME]?.bundleSpec).toBe(
      `file:///tmp/mediator/${MEDIATOR_BUNDLE_FILENAME}`,
    );
  });

  it('defaults forceReset to false', () => {
    const config = makeMediatorClusterConfig({
      bundleBaseUrl: 'x',
      socketPath: '/x.sock',
    });
    expect(config.forceReset).toBe(false);
  });

  it('passes forceReset through when set', () => {
    const config = makeMediatorClusterConfig({
      bundleBaseUrl: 'x',
      socketPath: '/x.sock',
      forceReset: true,
    });
    expect(config.forceReset).toBe(true);
  });
});
