import { startRelay } from '@metamask/kernel-utils/libp2p';
import type { Logger } from '@metamask/logger';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const RELAY_PID_PATH = join(homedir(), '.ocap', 'relay.pid');

/**
 * Read a PID from a file.
 *
 * @param pidPath - The PID file path.
 * @returns The PID, or undefined if the file is missing or invalid.
 */
async function readPidFile(pidPath: string): Promise<number | undefined> {
  try {
    const pid = Number(await readFile(pidPath, 'utf-8'));
    return pid > 0 && !Number.isNaN(pid) ? pid : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check whether a process is alive by sending signal 0.
 *
 * @param pid - The process ID to check.
 * @returns True if the process exists.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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
    rm(RELAY_PID_PATH, { force: true }).catch(() => undefined);
    // eslint-disable-next-line n/no-process-exit -- signal handler must force exit after cleanup
    process.exit(0);
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  await startRelay(logger);

  // Defensive cleanup if startRelay ever returns.
  await rm(RELAY_PID_PATH, { force: true });
}

/**
 * Print whether the relay process is running.
 */
export async function printRelayStatus(): Promise<void> {
  const pid = await readPidFile(RELAY_PID_PATH);
  if (pid !== undefined && isProcessAlive(pid)) {
    process.stderr.write(`Relay is running (PID: ${pid}).\n`);
  } else {
    process.stderr.write('Relay is not running.\n');
    process.exitCode = 1;
  }
}
