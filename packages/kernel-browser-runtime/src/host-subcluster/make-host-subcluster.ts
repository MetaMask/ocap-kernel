import type { SystemSubclusterConfig } from '@metamask/ocap-kernel';

import type {
  HostSubclusterResult,
  MakeHostSubclusterOptions,
} from './types.ts';

/**
 * Create and launch the host subcluster.
 *
 * The host subcluster is a system subcluster that runs in the host process
 * (e.g., the browser extension background script). The bootstrap vat receives
 * a kernel facet as a vatpower, enabling it to launch dynamic subclusters and
 * receive E()-callable presences.
 *
 * @param options - Configuration options.
 * @param options.kernel - The kernel instance.
 * @param options.config - Configuration for the host subcluster.
 * @returns A promise for the launch result.
 */
export async function makeHostSubcluster(
  options: MakeHostSubclusterOptions,
): Promise<HostSubclusterResult> {
  const { kernel, config } = options;

  // Convert HostSubclusterConfig to SystemSubclusterConfig
  const systemConfig: SystemSubclusterConfig = {
    bootstrap: config.bootstrap,
    vats: {},
    ...(config.services !== undefined && { services: config.services }),
  };

  for (const [vatName, vatConfig] of Object.entries(config.vats)) {
    systemConfig.vats[vatName] = {
      buildRootObject: vatConfig.buildRootObject,
      ...(vatConfig.parameters !== undefined && {
        parameters: vatConfig.parameters,
      }),
    };
  }

  // Launch the system subcluster
  const result = await kernel.launchSystemSubcluster(systemConfig);

  return {
    systemSubclusterId: result.systemSubclusterId,
    vatIds: result.vatIds as Record<string, string>,
  };
}
