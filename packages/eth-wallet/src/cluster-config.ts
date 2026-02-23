import type { ClusterConfig } from '@metamask/ocap-kernel';

import type { Address } from './types.ts';

/**
 * Options for creating a wallet cluster configuration.
 */
export type WalletClusterConfigOptions = {
  bundleBaseUrl: string;
  delegationManagerAddress?: Address;
  chainId?: number;
  forceReset?: boolean;
  services?: string[];
  allowedHosts?: string[];
};

/**
 * Create a ClusterConfig for the wallet subcluster.
 *
 * @param options - Configuration options.
 * @returns The cluster configuration.
 */
export function makeWalletClusterConfig(
  options: WalletClusterConfigOptions,
): ClusterConfig {
  const {
    bundleBaseUrl,
    delegationManagerAddress,
    services = ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    allowedHosts,
  } = options;

  return {
    bootstrap: 'coordinator',
    forceReset: options.forceReset ?? true,
    services,
    vats: {
      coordinator: {
        bundleSpec: `${bundleBaseUrl}/coordinator-vat.bundle`,
        globals: ['TextEncoder', 'TextDecoder'],
      },
      keyring: {
        bundleSpec: `${bundleBaseUrl}/keyring-vat.bundle`,
        globals: ['TextEncoder', 'TextDecoder'],
      },
      provider: {
        bundleSpec: `${bundleBaseUrl}/provider-vat.bundle`,
        globals: ['TextEncoder', 'TextDecoder'],
        platformConfig: {
          fetch: allowedHosts ? { allowedHosts } : {},
        },
      },
      delegation: {
        bundleSpec: `${bundleBaseUrl}/delegation-vat.bundle`,
        globals: ['TextEncoder', 'TextDecoder'],
        ...(delegationManagerAddress
          ? { parameters: { delegationManagerAddress } }
          : {}),
      },
    },
  };
}
