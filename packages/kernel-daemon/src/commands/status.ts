import type { Logger } from '@metamask/logger';
import { access, stat } from 'node:fs/promises';
import { homedir } from 'node:os';

import { PID_FILE, SOCK_FILE } from '../constants.ts';
import { isDaemonRunning, readDaemonPid } from '../daemon-lifecycle.ts';

/**
 * Format a duration in milliseconds as a human-readable string.
 *
 * @param ms - Duration in milliseconds.
 * @returns A string like "2h 15m 3s".
 */
export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

/**
 * Handle the `kernel daemon status` command.
 * Prints a concise status summary of the daemon.
 *
 * @param logger - Logger for output.
 */
export async function handleDaemonStatus(logger: Logger): Promise<void> {
  const running = await isDaemonRunning();
  if (!running) {
    logger.info('Status: stopped');
    return;
  }

  const pid = await readDaemonPid();
  logger.info('Status: running');
  logger.info(`PID: ${pid}`);

  try {
    const pidStat = await stat(PID_FILE);
    const uptime = Date.now() - pidStat.birthtime.getTime();
    logger.info(`Uptime: ${formatUptime(uptime)}`);
  } catch {
    // PID file stat failed; skip uptime
  }

  try {
    await access(SOCK_FILE);
    const displayPath = SOCK_FILE.replace(homedir(), '~');
    logger.info(`Socket: ${displayPath}`);
  } catch {
    logger.info('Socket: not found');
  }
}
