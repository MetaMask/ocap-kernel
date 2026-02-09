import type { Logger } from '@metamask/logger';

import { isDaemonRunning, readDaemonPid } from '../daemon-lifecycle.ts';

/**
 * Handle the `kernel daemon pid` command.
 * Prints the daemon PID and whether it is running.
 *
 * @param logger - Logger for output.
 */
export async function handleDaemonPid(logger: Logger): Promise<void> {
  const pid = await readDaemonPid();
  if (pid === null) {
    logger.info('No daemon PID file found');
    return;
  }
  const running = await isDaemonRunning();
  logger.info(`${pid}${running ? '' : ' (not running)'}`);
}
