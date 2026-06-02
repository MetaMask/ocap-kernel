import { describe, expect, it } from 'vitest';

import {
  ECHO_VAT_NAME,
  INDUSTRIAL_DESIGN_VAT_NAME,
  RANDOM_NUMBER_VAT_NAME,
  makeEchoClusterConfig,
  makeIndustrialDesignClusterConfig,
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

describe('makeIndustrialDesignClusterConfig', () => {
  it('threads matcherUrl into vat parameters and uses the supplied bundle spec', () => {
    const config = makeIndustrialDesignClusterConfig({
      bundleSpec: 'file:///tmp/industrial-design.bundle',
      matcherUrl: 'ocap:lmn@peer',
    });

    expect(config.bootstrap).toBe(INDUSTRIAL_DESIGN_VAT_NAME);
    expect(config.forceReset).toBe(false);
    expect(config.services).toStrictEqual([
      'ocapURLIssuerService',
      'ocapURLRedemptionService',
    ]);
    expect(config.vats[INDUSTRIAL_DESIGN_VAT_NAME]).toStrictEqual({
      bundleSpec: 'file:///tmp/industrial-design.bundle',
      parameters: { matcherUrl: 'ocap:lmn@peer' },
    });
  });

  it('respects forceReset when supplied', () => {
    const config = makeIndustrialDesignClusterConfig({
      bundleSpec: 'file:///tmp/industrial-design.bundle',
      matcherUrl: '',
      forceReset: true,
    });
    expect(config.forceReset).toBe(true);
  });
});
