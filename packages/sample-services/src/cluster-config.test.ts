import { describe, expect, it } from 'vitest';

import {
  ECHO_VAT_NAME,
  RANDOM_NUMBER_VAT_NAME,
  makeEchoClusterConfig,
  makeRandomNumberClusterConfig,
} from './cluster-config.ts';

describe('makeEchoClusterConfig', () => {
  it('threads matcherUrl into vat parameters and uses the supplied bundle spec', () => {
    const config = makeEchoClusterConfig({
      bundleSpec: 'file:///tmp/echo.bundle',
      matcherUrl: 'ocap:abc@peer',
    });

    expect(config.bootstrap).toBe(ECHO_VAT_NAME);
    expect(config.forceReset).toBe(false);
    expect(config.services).toStrictEqual([
      'ocapURLIssuerService',
      'ocapURLRedemptionService',
    ]);
    expect(config.vats[ECHO_VAT_NAME]).toStrictEqual({
      bundleSpec: 'file:///tmp/echo.bundle',
      parameters: { matcherUrl: 'ocap:abc@peer' },
    });
  });

  it('respects forceReset when supplied', () => {
    const config = makeEchoClusterConfig({
      bundleSpec: 'file:///tmp/echo.bundle',
      matcherUrl: '',
      forceReset: true,
    });
    expect(config.forceReset).toBe(true);
  });
});

describe('makeRandomNumberClusterConfig', () => {
  it('threads matcherUrl into vat parameters and uses the supplied bundle spec', () => {
    const config = makeRandomNumberClusterConfig({
      bundleSpec: 'file:///tmp/rng.bundle',
      matcherUrl: 'ocap:xyz@peer',
    });

    expect(config.bootstrap).toBe(RANDOM_NUMBER_VAT_NAME);
    expect(config.vats[RANDOM_NUMBER_VAT_NAME]).toStrictEqual({
      bundleSpec: 'file:///tmp/rng.bundle',
      parameters: { matcherUrl: 'ocap:xyz@peer' },
    });
  });
});
