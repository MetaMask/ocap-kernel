import type { Logger } from '@metamask/logger';

import { connectToDaemon } from '../daemon-client.ts';
import type { GetMethodSpecs } from './types.ts';

type ViewCategory = 'objects' | 'promises' | 'vats';

const categoryConfig: Record<
  ViewCategory,
  { prefix: string; label: string; emptyMessage: string }
> = {
  objects: {
    prefix: 'ko',
    label: 'Objects',
    emptyMessage: 'No objects in kernel registry',
  },
  promises: {
    prefix: 'kp',
    label: 'Promises',
    emptyMessage: 'No promises in kernel registry',
  },
  vats: {
    prefix: 'v',
    label: 'Vat entries',
    emptyMessage: 'No vat entries in kernel registry',
  },
};

/**
 * Handle a `kernel daemon view <category>` command.
 * Queries the daemon's kernel database and displays entries matching the
 * requested category.
 *
 * @param category - Which category of kernel state to display.
 * @param getMethodSpecs - Async getter for RPC method specifications.
 * @param logger - Logger for output.
 */
export async function handleView(
  category: ViewCategory,
  getMethodSpecs: GetMethodSpecs,
  logger: Logger,
): Promise<void> {
  const { prefix, label, emptyMessage } = categoryConfig[category];
  const methodSpecs = await getMethodSpecs();
  const { client, close } = await connectToDaemon(methodSpecs, logger);

  try {
    const entries = (await client.call('executeDBQuery', {
      sql: 'SELECT key, value FROM kv',
    })) as { key: string; value: string }[];

    const filtered = entries.filter((entry) => entry.key.startsWith(prefix));

    if (filtered.length === 0) {
      logger.info(emptyMessage);
      return;
    }

    logger.info(`\n${label} (${filtered.length}):`);
    for (const { key, value } of filtered) {
      logger.info(`  ${key} = ${value}`);
    }
  } finally {
    close();
  }
}
