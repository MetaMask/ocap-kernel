import type { Logger } from '@metamask/logger';

import { connectToDaemon } from '../daemon-client.ts';
import type { GetMethodSpecs } from './types.ts';

/**
 * Attempt to parse a string as JSON, falling back to the raw string.
 *
 * @param value - The string value to try parsing.
 * @returns The parsed JSON value, or the original string.
 */
function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Handle the `kernel daemon invoke <kref> <method> [...args]` command.
 * Sends a message to the specified kernel object via the daemon.
 *
 * @param kref - The kernel reference to target.
 * @param method - The method name to invoke.
 * @param args - Arguments to pass, JSON-parsed where possible.
 * @param getMethodSpecs - Async getter for RPC method specifications.
 * @param logger - Logger for output.
 */
export async function handleInvoke(
  kref: string,
  method: string,
  args: string[],
  getMethodSpecs: GetMethodSpecs,
  logger: Logger,
): Promise<void> {
  const methodSpecs = await getMethodSpecs();
  const { client, close } = await connectToDaemon(methodSpecs, logger);

  try {
    const parsedArgs = args.map(tryParseJson);
    const result = await client.call('queueMessage', [
      kref,
      method,
      parsedArgs,
    ] as never);
    logger.info(JSON.stringify(result, null, 2));
  } finally {
    close();
  }
}
