import type { Logger } from '@metamask/logger';

import { startDaemon } from '../daemon-lifecycle.ts';

/**
 * Handle the `kernel daemon start` command.
 * Forks a background daemon process and prints the PID.
 *
 * @param daemonProcessPath - Absolute path to the daemon process entry point script.
 * @param logger - Logger for output.
 */
export async function handleDaemonStart(
  daemonProcessPath: string,
  logger: Logger,
): Promise<void> {
  await startDaemon(daemonProcessPath, logger);
}
