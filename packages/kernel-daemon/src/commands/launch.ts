import type { Logger } from '@metamask/logger';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { connectToDaemon } from '../daemon-client.ts';
import type { GetMethodSpecs } from './types.ts';

/**
 * Handle the `kernel daemon launch <path>` command.
 * Reads a .bundle or subcluster.json and launches it via the daemon.
 *
 * @param filePath - Path to the file to launch.
 * @param getMethodSpecs - Async getter for RPC method specifications.
 * @param logger - Logger for output.
 */
export async function handleLaunch(
  filePath: string,
  getMethodSpecs: GetMethodSpecs,
  logger: Logger,
): Promise<void> {
  const resolved = path.resolve(filePath);
  const content = await readFile(resolved, 'utf-8');

  let config: Record<string, unknown>;
  if (resolved.endsWith('.json')) {
    config = JSON.parse(content);
  } else if (resolved.endsWith('.bundle')) {
    config = {
      bootstrap: 'main',
      vats: { main: { bundleSpec: `file://${resolved}` } },
    };
  } else {
    throw new Error(
      `Unsupported file type: ${path.extname(resolved)}. Expected .bundle or .json`,
    );
  }

  const methodSpecs = await getMethodSpecs();
  const { client, close } = await connectToDaemon(methodSpecs, logger);
  try {
    const result = (await client.call('launchSubcluster', {
      config,
    })) as { subclusterId: string; bootstrapRootKref: string };
    logger.info(`Subcluster launched: ${result.subclusterId}`);
    logger.info(`Bootstrap root kref: ${result.bootstrapRootKref}`);
  } finally {
    close();
  }
}
