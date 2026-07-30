import type { ClusterConfig } from '@metamask/ocap-kernel';

/** Vat name for the mediator inside its subcluster. */
export const MEDIATOR_VAT_NAME = 'llmMediator';

/**
 * Filename of the mediator vat bundle produced by `yarn bundle-vat` in
 * this package. A launcher supplies a `bundleBaseUrl` pointing at the
 * directory containing this file.
 */
export const MEDIATOR_BUNDLE_FILENAME = 'index.bundle';

/** IO channel name that the mediator vat expects in its endowments. */
export const MEDIATOR_SOCKET_CHANNEL = 'socket';

/**
 * Build a `ClusterConfig` for the mediator subcluster.
 *
 * @param options - Configuration options.
 * @param options.bundleBaseUrl - Base URL (or filesystem path) where the
 * mediator vat bundle is reachable. The bundle filename is appended.
 * @param options.socketPath - Filesystem path for the Unix-domain-socket
 * IO channel the vat listens on.
 * @param options.forceReset - Whether to reset the subcluster on launch.
 * Defaults to `false`.
 * @returns A ClusterConfig ready for `kernel.launchSubcluster(...)`.
 */
export function makeMediatorClusterConfig(options: {
  bundleBaseUrl: string;
  socketPath: string;
  forceReset?: boolean;
}): ClusterConfig {
  const { bundleBaseUrl, socketPath, forceReset = false } = options;
  return {
    bootstrap: MEDIATOR_VAT_NAME,
    forceReset,
    services: ['ocapURLRedemptionService'],
    io: {
      [MEDIATOR_SOCKET_CHANNEL]: {
        type: 'socket',
        path: socketPath,
      },
    },
    vats: {
      [MEDIATOR_VAT_NAME]: {
        bundleSpec: `${bundleBaseUrl}/${MEDIATOR_BUNDLE_FILENAME}`,
      },
    },
  };
}
