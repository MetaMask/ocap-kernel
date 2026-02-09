import type { Logger } from '@metamask/logger';

import { stopDaemon } from '../daemon-lifecycle.ts';

/**
 * Handle the `kernel daemon stop` command.
 * Sends a shutdown RPC to the running daemon.
 *
 * @param logger - Logger for output.
 */
export async function handleDaemonStop(logger: Logger): Promise<void> {
  await stopDaemon(logger);
}
