import { startRelay } from '@metamask/kernel-utils/libp2p';
import type { Logger } from '@metamask/logger';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { isProcessAlive, readPidFile, waitFor } from '../utils.ts';

const RELAY_PID_PATH = join(homedir(), '.ocap', 'relay.pid');

/**
 * Start the relay server, write a PID file, and register signal handlers for
 * cleanup on exit.
 *
 * @param logger - The logger instance.
 */
export async function startRelayWithBookkeeping(logger: Logger): Promise<void> {
  await mkdir(join(homedir(), '.ocap'), { recursive: true });
  await rm(RELAY_PID_PATH, { force: true });
  await writeFile(RELAY_PID_PATH, String(process.pid));

  const cleanup = (): void => {
    rm(RELAY_PID_PATH, { force: true })
      .catch(() => undefined)
      // eslint-disable-next-line n/no-process-exit -- signal handler must force exit after cleanup
      .finally(() => process.exit(0));
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  await startRelay(logger);
}

/**
 * Print whether the relay process is running.
 */
export async function printRelayStatus(): Promise<void> {
  const pid = await readPidFile(RELAY_PID_PATH);
  if (pid !== undefined && isProcessAlive(pid)) {
    process.stderr.write(`Relay is running (PID: ${pid}).\n`);
  } else {
    if (pid !== undefined) {
      await rm(RELAY_PID_PATH, { force: true });
    }
    process.stderr.write('Relay is not running.\n');
    process.exitCode = 1;
  }
}

/**
 * Stop the relay process. Sends SIGTERM and waits; escalates to SIGKILL if
 * `force` is true and SIGTERM is ignored.
 *
 * @param options - Options.
 * @param options.force - Send SIGKILL if SIGTERM fails to stop the relay.
 * @returns True if the relay was stopped (or was not running), false otherwise.
 */
export async function stopRelay({
  force = false,
}: { force?: boolean } = {}): Promise<boolean> {
  const pid = await readPidFile(RELAY_PID_PATH);

  if (pid === undefined || !isProcessAlive(pid)) {
    if (pid !== undefined) {
      await rm(RELAY_PID_PATH, { force: true });
    }
    process.stderr.write('Relay is not running.\n');
    return true;
  }

  process.stderr.write('Stopping relay...\n');
  let stopped = false;

  // Strategy 1: SIGTERM.
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    stopped = true;
  }
  if (!stopped) {
    stopped = await waitFor(() => !isProcessAlive(pid), 5_000);
  }

  // Strategy 2: SIGKILL (only with --force).
  if (!stopped && force) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      stopped = true;
    }
    if (!stopped) {
      stopped = await waitFor(() => !isProcessAlive(pid), 2_000);
    }
  }

  if (stopped) {
    await rm(RELAY_PID_PATH, { force: true });
    process.stderr.write('Relay stopped.\n');
  } else {
    process.stderr.write('Relay did not stop within timeout.\n');
  }
  return stopped;
}
