import type { ClusterConfig } from '@metamask/ocap-kernel';

/**
 * Bootstrap-vat name for the Echo service subcluster. Exported so the
 * host-side launcher reading the bootstrap result can address the right
 * vat.
 */
export const ECHO_VAT_NAME = 'echo';

/**
 * Bootstrap-vat name for the RandomNumber service subcluster.
 */
export const RANDOM_NUMBER_VAT_NAME = 'random-number';

/**
 * Bootstrap-vat name for the IndustrialDesign service subcluster
 * (orchestration demo).
 */
export const INDUSTRIAL_DESIGN_VAT_NAME = 'industrial-design';

/**
 * Bootstrap-vat name for the SchematicGeneration service subcluster.
 */
export const SCHEMATIC_GENERATION_VAT_NAME = 'schematic-generation';

/**
 * Bootstrap-vat name for the FirmwareSpec service subcluster.
 */
export const FIRMWARE_SPEC_VAT_NAME = 'firmware-spec';

/**
 * Bootstrap-vat name for the MechanicalDesign service subcluster.
 */
export const MECHANICAL_DESIGN_VAT_NAME = 'mechanical-design';

/**
 * Bootstrap-vat name for the PcbLayout service subcluster.
 */
export const PCB_LAYOUT_VAT_NAME = 'pcb-layout';

/**
 * Bootstrap-vat name for the ComponentSourcing service subcluster
 * (Procurement phase).
 */
export const COMPONENT_SOURCING_VAT_NAME = 'component-sourcing';

/**
 * Bootstrap-vat name for the DeviceAssembly service subcluster
 * (Manufacturing phase).
 */
export const DEVICE_ASSEMBLY_VAT_NAME = 'device-assembly';

/**
 * Bootstrap-vat name for the RetailListing service subcluster
 * (Sales phase).
 */
export const RETAIL_LISTING_VAT_NAME = 'retail-listing';

/**
 * Filename of each vat's bundle as produced by `yarn bundle-vats` in
 * this package. The ocap-kernel CLI writes the bundle next to its
 * source as `index.bundle`, so callers wanting a `bundleSpec`
 * typically combine the source directory with this filename.
 */
export const ECHO_BUNDLE_PATH = 'echo-service/index.bundle';
export const RANDOM_NUMBER_BUNDLE_PATH = 'random-number-service/index.bundle';
export const INDUSTRIAL_DESIGN_BUNDLE_PATH = 'industrial-design/index.bundle';
export const SCHEMATIC_GENERATION_BUNDLE_PATH =
  'schematic-generation/index.bundle';
export const FIRMWARE_SPEC_BUNDLE_PATH = 'firmware-spec/index.bundle';
export const MECHANICAL_DESIGN_BUNDLE_PATH = 'mechanical-design/index.bundle';
export const PCB_LAYOUT_BUNDLE_PATH = 'pcb-layout/index.bundle';
export const COMPONENT_SOURCING_BUNDLE_PATH = 'component-sourcing/index.bundle';
export const DEVICE_ASSEMBLY_BUNDLE_PATH = 'device-assembly/index.bundle';
export const RETAIL_LISTING_BUNDLE_PATH = 'retail-listing/index.bundle';

/**
 * Shape of either service vat's bootstrap result. Both vats expose the
 * same fields so a launcher can handle them uniformly.
 */
export type SampleServiceBootstrapResult = {
  name: string;
  contactUrl: string;
};

/**
 * Build a ClusterConfig for the Echo subcluster.
 *
 * @param options - Configuration options.
 * @param options.bundleSpec - URL or path to the Echo vat bundle.
 * @param options.matcherUrl - OCAP URL of the service matcher to register
 * with at bootstrap. Pass an empty string to skip registration (useful
 * during development before the matcher is up).
 * @param options.forceReset - Whether to reset the subcluster on launch.
 * Defaults to `false`.
 * @returns A ClusterConfig ready for `kernel.launchSubcluster(...)`.
 */
export function makeEchoClusterConfig(options: {
  bundleSpec: string;
  matcherUrl: string;
  forceReset?: boolean;
}): ClusterConfig {
  const { bundleSpec, matcherUrl, forceReset = false } = options;
  return {
    bootstrap: ECHO_VAT_NAME,
    forceReset,
    services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    vats: {
      [ECHO_VAT_NAME]: {
        bundleSpec,
        parameters: { matcherUrl },
      },
    },
  };
}

/**
 * Build a ClusterConfig for the RandomNumber subcluster.
 *
 * @param options - Configuration options.
 * @param options.bundleSpec - URL or path to the RandomNumber vat bundle.
 * @param options.matcherUrl - OCAP URL of the service matcher.
 * @param options.forceReset - Whether to reset the subcluster on launch.
 * Defaults to `false`.
 * @returns A ClusterConfig ready for `kernel.launchSubcluster(...)`.
 */
export function makeRandomNumberClusterConfig(options: {
  bundleSpec: string;
  matcherUrl: string;
  forceReset?: boolean;
}): ClusterConfig {
  const { bundleSpec, matcherUrl, forceReset = false } = options;
  return {
    bootstrap: RANDOM_NUMBER_VAT_NAME,
    forceReset,
    services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    vats: {
      [RANDOM_NUMBER_VAT_NAME]: {
        bundleSpec,
        parameters: { matcherUrl },
      },
    },
  };
}

/**
 * Build a ClusterConfig for the IndustrialDesign subcluster
 * (orchestration demo). First of the V0 demo service vats.
 *
 * @param options - Configuration options.
 * @param options.bundleSpec - URL or path to the IndustrialDesign vat bundle.
 * @param options.matcherUrl - OCAP URL of the service matcher.
 * @param options.forceReset - Whether to reset the subcluster on launch.
 *   Defaults to `false`.
 * @returns A ClusterConfig ready for `kernel.launchSubcluster(...)`.
 */
export function makeIndustrialDesignClusterConfig(options: {
  bundleSpec: string;
  matcherUrl: string;
  forceReset?: boolean;
}): ClusterConfig {
  const { bundleSpec, matcherUrl, forceReset = false } = options;
  return {
    bootstrap: INDUSTRIAL_DESIGN_VAT_NAME,
    forceReset,
    services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    vats: {
      [INDUSTRIAL_DESIGN_VAT_NAME]: {
        bundleSpec,
        parameters: { matcherUrl },
      },
    },
  };
}

/**
 * Build a ClusterConfig for the SchematicGeneration subcluster.
 *
 * @param options - Configuration options.
 * @param options.bundleSpec - URL or path to the SchematicGeneration vat bundle.
 * @param options.matcherUrl - OCAP URL of the service matcher.
 * @param options.forceReset - Whether to reset the subcluster on launch.
 *   Defaults to `false`.
 * @returns A ClusterConfig ready for `kernel.launchSubcluster(...)`.
 */
export function makeSchematicGenerationClusterConfig(options: {
  bundleSpec: string;
  matcherUrl: string;
  forceReset?: boolean;
}): ClusterConfig {
  const { bundleSpec, matcherUrl, forceReset = false } = options;
  return {
    bootstrap: SCHEMATIC_GENERATION_VAT_NAME,
    forceReset,
    services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    vats: {
      [SCHEMATIC_GENERATION_VAT_NAME]: {
        bundleSpec,
        parameters: { matcherUrl },
      },
    },
  };
}

/**
 * Build a ClusterConfig for the FirmwareSpec subcluster.
 *
 * @param options - Configuration options.
 * @param options.bundleSpec - URL or path to the FirmwareSpec vat bundle.
 * @param options.matcherUrl - OCAP URL of the service matcher.
 * @param options.forceReset - Whether to reset the subcluster on launch.
 *   Defaults to `false`.
 * @returns A ClusterConfig ready for `kernel.launchSubcluster(...)`.
 */
export function makeFirmwareSpecClusterConfig(options: {
  bundleSpec: string;
  matcherUrl: string;
  forceReset?: boolean;
}): ClusterConfig {
  const { bundleSpec, matcherUrl, forceReset = false } = options;
  return {
    bootstrap: FIRMWARE_SPEC_VAT_NAME,
    forceReset,
    services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    vats: {
      [FIRMWARE_SPEC_VAT_NAME]: {
        bundleSpec,
        parameters: { matcherUrl },
      },
    },
  };
}

/**
 * Build a ClusterConfig for the MechanicalDesign subcluster.
 *
 * @param options - Configuration options.
 * @param options.bundleSpec - URL or path to the MechanicalDesign vat bundle.
 * @param options.matcherUrl - OCAP URL of the service matcher.
 * @param options.forceReset - Whether to reset the subcluster on launch.
 *   Defaults to `false`.
 * @returns A ClusterConfig ready for `kernel.launchSubcluster(...)`.
 */
export function makeMechanicalDesignClusterConfig(options: {
  bundleSpec: string;
  matcherUrl: string;
  forceReset?: boolean;
}): ClusterConfig {
  const { bundleSpec, matcherUrl, forceReset = false } = options;
  return {
    bootstrap: MECHANICAL_DESIGN_VAT_NAME,
    forceReset,
    services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    vats: {
      [MECHANICAL_DESIGN_VAT_NAME]: {
        bundleSpec,
        parameters: { matcherUrl },
      },
    },
  };
}

/**
 * Build a ClusterConfig for the PcbLayout subcluster.
 *
 * @param options - Configuration options.
 * @param options.bundleSpec - URL or path to the PcbLayout vat bundle.
 * @param options.matcherUrl - OCAP URL of the service matcher.
 * @param options.forceReset - Whether to reset the subcluster on launch.
 *   Defaults to `false`.
 * @returns A ClusterConfig ready for `kernel.launchSubcluster(...)`.
 */
export function makePcbLayoutClusterConfig(options: {
  bundleSpec: string;
  matcherUrl: string;
  forceReset?: boolean;
}): ClusterConfig {
  const { bundleSpec, matcherUrl, forceReset = false } = options;
  return {
    bootstrap: PCB_LAYOUT_VAT_NAME,
    forceReset,
    services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    vats: {
      [PCB_LAYOUT_VAT_NAME]: {
        bundleSpec,
        parameters: { matcherUrl },
      },
    },
  };
}

/**
 * Build a ClusterConfig for the ComponentSourcing subcluster.
 *
 * @param options - Configuration options.
 * @param options.bundleSpec - URL or path to the ComponentSourcing vat bundle.
 * @param options.matcherUrl - OCAP URL of the service matcher.
 * @param options.forceReset - Whether to reset the subcluster on launch.
 *   Defaults to `false`.
 * @returns A ClusterConfig ready for `kernel.launchSubcluster(...)`.
 */
export function makeComponentSourcingClusterConfig(options: {
  bundleSpec: string;
  matcherUrl: string;
  forceReset?: boolean;
}): ClusterConfig {
  const { bundleSpec, matcherUrl, forceReset = false } = options;
  return {
    bootstrap: COMPONENT_SOURCING_VAT_NAME,
    forceReset,
    services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    vats: {
      [COMPONENT_SOURCING_VAT_NAME]: {
        bundleSpec,
        parameters: { matcherUrl },
      },
    },
  };
}

/**
 * Build a ClusterConfig for the DeviceAssembly subcluster.
 *
 * @param options - Configuration options.
 * @param options.bundleSpec - URL or path to the DeviceAssembly vat bundle.
 * @param options.matcherUrl - OCAP URL of the service matcher.
 * @param options.forceReset - Whether to reset the subcluster on launch.
 *   Defaults to `false`.
 * @returns A ClusterConfig ready for `kernel.launchSubcluster(...)`.
 */
export function makeDeviceAssemblyClusterConfig(options: {
  bundleSpec: string;
  matcherUrl: string;
  forceReset?: boolean;
}): ClusterConfig {
  const { bundleSpec, matcherUrl, forceReset = false } = options;
  return {
    bootstrap: DEVICE_ASSEMBLY_VAT_NAME,
    forceReset,
    services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    vats: {
      [DEVICE_ASSEMBLY_VAT_NAME]: {
        bundleSpec,
        parameters: { matcherUrl },
      },
    },
  };
}

/**
 * Build a ClusterConfig for the RetailListing subcluster.
 *
 * @param options - Configuration options.
 * @param options.bundleSpec - URL or path to the RetailListing vat bundle.
 * @param options.matcherUrl - OCAP URL of the service matcher.
 * @param options.forceReset - Whether to reset the subcluster on launch.
 *   Defaults to `false`.
 * @returns A ClusterConfig ready for `kernel.launchSubcluster(...)`.
 */
export function makeRetailListingClusterConfig(options: {
  bundleSpec: string;
  matcherUrl: string;
  forceReset?: boolean;
}): ClusterConfig {
  const { bundleSpec, matcherUrl, forceReset = false } = options;
  return {
    bootstrap: RETAIL_LISTING_VAT_NAME,
    forceReset,
    services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    vats: {
      [RETAIL_LISTING_VAT_NAME]: {
        bundleSpec,
        parameters: { matcherUrl },
      },
    },
  };
}
