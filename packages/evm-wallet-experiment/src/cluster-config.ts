import type { ClusterConfig } from '@metamask/ocap-kernel';

/**
 * Options for creating a wallet cluster configuration.
 */
export type WalletClusterConfigOptions = {
  bundleBaseUrl: string;
  role?: 'home' | 'away';
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
    role = 'home',
    services = ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    allowedHosts,
  } = options;

  const coordinatorBundle =
    role === 'home'
      ? `${bundleBaseUrl}/home-coordinator.bundle`
      : `${bundleBaseUrl}/away-coordinator.bundle`;

  const auxiliaryVat =
    role === 'home'
      ? {
          delegator: {
            bundleSpec: `${bundleBaseUrl}/delegator-vat.bundle`,
            globals: ['TextEncoder', 'TextDecoder'],
          },
        }
      : {
          redeemer: {
            bundleSpec: `${bundleBaseUrl}/redeemer-vat.bundle`,
            globals: ['TextEncoder', 'TextDecoder'],
          },
        };

  return {
    bootstrap: 'coordinator',
    forceReset: options.forceReset ?? false,
    services,
    vats: {
      coordinator: {
        bundleSpec: coordinatorBundle,
        globals: ['TextEncoder', 'TextDecoder', 'Date', 'setTimeout'],
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
      ...auxiliaryVat,
    },
  };
}
