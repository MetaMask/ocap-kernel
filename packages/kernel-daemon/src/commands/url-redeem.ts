import type { Logger } from '@metamask/logger';

import { connectToDaemon } from '../daemon-client.ts';
import type { GetMethodSpecs } from './types.ts';

/**
 * Handle the `kernel daemon url redeem <url>` command.
 * Redeems an OCAP URL to get its kernel reference via the daemon.
 *
 * @param url - The OCAP URL to redeem.
 * @param getMethodSpecs - Async getter for RPC method specifications.
 * @param logger - Logger for output.
 */
export async function handleUrlRedeem(
  url: string,
  getMethodSpecs: GetMethodSpecs,
  logger: Logger,
): Promise<void> {
  const methodSpecs = await getMethodSpecs();
  const { client, close } = await connectToDaemon(methodSpecs, logger);

  try {
    const kref = await client.call('redeemOcapURL', { url } as never);
    logger.info(String(kref));
  } finally {
    close();
  }
}
