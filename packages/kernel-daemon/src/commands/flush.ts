import type { Logger } from '@metamask/logger';

import { flushDaemonStore } from '../daemon-lifecycle.ts';

/**
 * Handle the `kernel daemon flush` command.
 * Deletes the daemon database (daemon must be stopped).
 *
 * @param logger - Logger for output.
 */
export async function handleDaemonFlush(logger: Logger): Promise<void> {
  await flushDaemonStore(logger);
}
