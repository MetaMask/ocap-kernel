import { logger } from './logger.ts';
import { runCluster } from './run-cluster.ts';

/**
 * Run a script in a cluster.
 *
 * @param clusterPath - Path to the cluster config
 * @param scriptPath - Path to the script
 */
export async function runScript(
  clusterPath: string,
  scriptPath: string,
): Promise<void> {
  const { kernel } = await runCluster(clusterPath, { logger });
  const { main } = await import(scriptPath);
  await main(kernel, logger);
}
