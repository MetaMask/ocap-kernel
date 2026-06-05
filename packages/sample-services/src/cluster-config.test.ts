import { describe, expect, it } from 'vitest';

import {
  ECHO_VAT_NAME,
  FIRMWARE_SPEC_VAT_NAME,
  INDUSTRIAL_DESIGN_VAT_NAME,
  MECHANICAL_DESIGN_VAT_NAME,
  PCB_LAYOUT_VAT_NAME,
  RANDOM_NUMBER_VAT_NAME,
  SCHEMATIC_GENERATION_VAT_NAME,
  makeEchoClusterConfig,
  makeFirmwareSpecClusterConfig,
  makeIndustrialDesignClusterConfig,
  makeMechanicalDesignClusterConfig,
  makePcbLayoutClusterConfig,
  makeRandomNumberClusterConfig,
  makeSchematicGenerationClusterConfig,
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

describe('makeSchematicGenerationClusterConfig', () => {
  it('threads matcherUrl into vat parameters and uses the supplied bundle spec', () => {
    const config = makeSchematicGenerationClusterConfig({
      bundleSpec: 'file:///tmp/schematic-generation.bundle',
      matcherUrl: 'ocap:opq@peer',
    });

    expect(config.bootstrap).toBe(SCHEMATIC_GENERATION_VAT_NAME);
    expect(config.forceReset).toBe(false);
    expect(config.services).toStrictEqual([
      'ocapURLIssuerService',
      'ocapURLRedemptionService',
    ]);
    expect(config.vats[SCHEMATIC_GENERATION_VAT_NAME]).toStrictEqual({
      bundleSpec: 'file:///tmp/schematic-generation.bundle',
      parameters: { matcherUrl: 'ocap:opq@peer' },
    });
  });
});

describe('makeFirmwareSpecClusterConfig', () => {
  it('threads matcherUrl into vat parameters and uses the supplied bundle spec', () => {
    const config = makeFirmwareSpecClusterConfig({
      bundleSpec: 'file:///tmp/firmware-spec.bundle',
      matcherUrl: 'ocap:rst@peer',
    });

    expect(config.bootstrap).toBe(FIRMWARE_SPEC_VAT_NAME);
    expect(config.forceReset).toBe(false);
    expect(config.vats[FIRMWARE_SPEC_VAT_NAME]).toStrictEqual({
      bundleSpec: 'file:///tmp/firmware-spec.bundle',
      parameters: { matcherUrl: 'ocap:rst@peer' },
    });
  });
});

describe('makeMechanicalDesignClusterConfig', () => {
  it('threads matcherUrl into vat parameters and uses the supplied bundle spec', () => {
    const config = makeMechanicalDesignClusterConfig({
      bundleSpec: 'file:///tmp/mechanical-design.bundle',
      matcherUrl: 'ocap:uvw@peer',
    });

    expect(config.bootstrap).toBe(MECHANICAL_DESIGN_VAT_NAME);
    expect(config.forceReset).toBe(false);
    expect(config.vats[MECHANICAL_DESIGN_VAT_NAME]).toStrictEqual({
      bundleSpec: 'file:///tmp/mechanical-design.bundle',
      parameters: { matcherUrl: 'ocap:uvw@peer' },
    });
  });
});

describe('makePcbLayoutClusterConfig', () => {
  it('threads matcherUrl into vat parameters and uses the supplied bundle spec', () => {
    const config = makePcbLayoutClusterConfig({
      bundleSpec: 'file:///tmp/pcb-layout.bundle',
      matcherUrl: 'ocap:xyz@peer',
    });

    expect(config.bootstrap).toBe(PCB_LAYOUT_VAT_NAME);
    expect(config.forceReset).toBe(false);
    expect(config.vats[PCB_LAYOUT_VAT_NAME]).toStrictEqual({
      bundleSpec: 'file:///tmp/pcb-layout.bundle',
      parameters: { matcherUrl: 'ocap:xyz@peer' },
    });
  });
});
