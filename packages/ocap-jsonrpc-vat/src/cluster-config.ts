import type { ClusterConfig } from '@metamask/ocap-kernel';

/** Vat name for the ocap JSON-RPC vat inside its subcluster. */
export const OCAP_JSONRPC_VAT_NAME = 'ocapJsonrpcVat';

/**
 * Filename of the vat bundle produced by `yarn bundle-vat` in this
 * package. A launcher supplies a `bundleBaseUrl` pointing at the
 * directory containing this file.
 */
export const OCAP_JSONRPC_BUNDLE_FILENAME = 'index.bundle';

/** IO channel name the vat expects in its endowments. */
export const OCAP_JSONRPC_SOCKET_CHANNEL = 'socket';

/**
 * Build a `ClusterConfig` for the ocap JSON-RPC subcluster.
 *
 * @param options - Configuration options.
 * @param options.bundleBaseUrl - Base URL (or filesystem path) where the
 * vat bundle is reachable. The bundle filename is appended.
 * @param options.socketPath - Filesystem path for the Unix-domain-socket
 * IO channel the vat listens on.
 * @param options.forceReset - Whether to reset the subcluster on launch.
 * Defaults to `false`.
 * @returns A ClusterConfig ready for `kernel.launchSubcluster(...)`.
 */
export function makeOcapJsonrpcClusterConfig(options: {
  bundleBaseUrl: string;
  socketPath: string;
  forceReset?: boolean;
}): ClusterConfig {
  const { bundleBaseUrl, socketPath, forceReset = false } = options;
  return {
    bootstrap: OCAP_JSONRPC_VAT_NAME,
    forceReset,
    services: ['ocapURLRedemptionService'],
    io: {
      [OCAP_JSONRPC_SOCKET_CHANNEL]: {
        type: 'socket',
        path: socketPath,
      },
    },
    vats: {
      [OCAP_JSONRPC_VAT_NAME]: {
        bundleSpec: `${bundleBaseUrl}/${OCAP_JSONRPC_BUNDLE_FILENAME}`,
      },
    },
  };
}
