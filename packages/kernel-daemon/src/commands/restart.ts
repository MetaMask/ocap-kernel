import type { Logger } from '@metamask/logger';

import {
  flushDaemonStore,
  startDaemon,
  stopDaemon,
} from '../daemon-lifecycle.ts';

/**
 * Handle the `kernel daemon restart` command.
 * Stops the running daemon and starts a new one.
 *
 * @param daemonProcessPath - Absolute path to the daemon process entry point script.
 * @param logger - Logger for output.
 * @param options - Options bag.
 * @param options.flush - If true, flush the daemon store between stop and start.
 */
export async function handleDaemonRestart(
  daemonProcessPath: string,
  logger: Logger,
  { flush = false }: { flush?: boolean } = {},
): Promise<void> {
  await stopDaemon(logger);

  if (flush) {
    await flushDaemonStore(logger);
  }

  await startDaemon(daemonProcessPath, logger);
}
