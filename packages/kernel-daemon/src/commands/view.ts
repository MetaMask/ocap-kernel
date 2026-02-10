import type { Logger } from '@metamask/logger';

import { connectToDaemon } from '../daemon-client.ts';
import type { GetMethodSpecs } from './types.ts';

const categoryPrefixes: Record<string, string> = {
  objects: 'ko',
  promises: 'kp',
  vats: 'v',
};

/**
 * Handle a `kernel daemon view` command.
 * Queries the daemon's kernel database and outputs all kernel state
 * (objects, promises, vats) as a JSON object to stdout.
 *
 * @param getMethodSpecs - Async getter for RPC method specifications.
 * @param logger - Logger for diagnostics.
 */
export async function handleView(
  getMethodSpecs: GetMethodSpecs,
  logger: Logger,
): Promise<void> {
  const methodSpecs = await getMethodSpecs();
  const { client, close } = await connectToDaemon(methodSpecs, logger);

  try {
    const entries = (await client.call('executeDBQuery', {
      sql: 'SELECT key, value FROM kv',
    })) as { key: string; value: string }[];

    const result: Record<string, Record<string, string>> = {};
    for (const [category, prefix] of Object.entries(categoryPrefixes)) {
      result[category] = Object.fromEntries(
        entries
          .filter((entry) => entry.key.startsWith(prefix))
          .map(({ key, value }) => [key, value]),
      );
    }

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    close();
  }
}
