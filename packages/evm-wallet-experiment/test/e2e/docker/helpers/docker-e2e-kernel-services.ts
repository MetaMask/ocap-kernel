/**
 * Compose service names for parallel Docker E2E kernels (one home/away pair per
 * DELEGATION_MODE). Shared `evm` + `bundler`; isolated QUIC ports per pair.
 *
 * Delegation-mode strings match `docker/demo-compose-lib.mjs` (`OCAP_INTERACTIVE_PAIR` / `--pair`).
 */

export type DockerKernelServicePair = {
  home: string;
  away: string;
};

export const DOCKER_E2E_KERNEL_MODES = [
  'bundler-7702',
  'bundler-hybrid',
  'peer-relay',
] as const;

export type DockerE2eKernelMode = (typeof DOCKER_E2E_KERNEL_MODES)[number];

const PAIRS: Record<DockerE2eKernelMode, DockerKernelServicePair> = {
  'bundler-7702': {
    home: 'kernel-home-bundler-7702',
    away: 'kernel-away-bundler-7702',
  },
  'bundler-hybrid': {
    home: 'kernel-home-bundler-hybrid',
    away: 'kernel-away-bundler-hybrid',
  },
  'peer-relay': {
    home: 'kernel-home-peer-relay',
    away: 'kernel-away-peer-relay',
  },
};

/**
 * Resolve the home/away compose service names for a delegation mode.
 *
 * @param delegationMode - Same values as `DELEGATION_MODE` (default bundler-7702).
 * @returns Compose service names for `docker compose exec` / health checks.
 */
export function dockerKernelServicesForMode(
  delegationMode: string,
): DockerKernelServicePair {
  if (
    !DOCKER_E2E_KERNEL_MODES.includes(delegationMode as DockerE2eKernelMode)
  ) {
    throw new Error(
      `Unknown DELEGATION_MODE for Docker kernels: ${delegationMode}. Expected one of: ${DOCKER_E2E_KERNEL_MODES.join(', ')}`,
    );
  }
  return PAIRS[delegationMode as DockerE2eKernelMode];
}

/**
 * All kernel pairs plus shared chain services (for `isStackHealthy`).
 *
 * @returns Compose service names to wait on before running Docker E2E.
 */
export function dockerE2eRequiredComposeServices(): string[] {
  return [
    'evm',
    'bundler',
    ...DOCKER_E2E_KERNEL_MODES.flatMap((kernelMode) => {
      const pair = PAIRS[kernelMode];
      return [pair.home, pair.away];
    }),
  ];
}

const HOME_SRP_ADDRESS_INDEX: Record<DockerE2eKernelMode, number> = {
  'bundler-7702': 0,
  'bundler-hybrid': 1,
  'peer-relay': 2,
};

/**
 * BIP-44 address index for the shared Anvil test mnemonic on each home kernel.
 * Parallel pairs must not all use index 0 or they collide on the same EOA.
 *
 * @param mode - Docker E2E delegation mode (selects the home/away compose pair).
 * @returns HD `addressIndex` passed to SRP keyring init for that pair's home.
 */
export function dockerE2eHomeSrpAddressIndex(
  mode: DockerE2eKernelMode,
): number {
  return HOME_SRP_ADDRESS_INDEX[mode];
}
