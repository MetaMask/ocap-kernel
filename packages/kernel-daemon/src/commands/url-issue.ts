import type { Logger } from '@metamask/logger';

import { connectToDaemon } from '../daemon-client.ts';
import type { GetMethodSpecs } from './types.ts';

/**
 * Handle the `kernel daemon url issue <kref>` command.
 * Issues an OCAP URL for the given kernel reference via the daemon.
 *
 * @param kref - The kernel reference to issue an OCAP URL for.
 * @param getMethodSpecs - Async getter for RPC method specifications.
 * @param logger - Logger for output.
 */
export async function handleUrlIssue(
  kref: string,
  getMethodSpecs: GetMethodSpecs,
  logger: Logger,
): Promise<void> {
  const methodSpecs = await getMethodSpecs();
  const { client, close } = await connectToDaemon(methodSpecs, logger);

  try {
    const url = await client.call('issueOcapURL', { kref } as never);
    logger.info(String(url));
  } finally {
    close();
  }
}
