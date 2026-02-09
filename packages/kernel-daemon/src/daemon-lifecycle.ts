import type { Logger } from '@metamask/logger';
import { fork } from 'node:child_process';
import { access, readFile, unlink, mkdir } from 'node:fs/promises';

import { DAEMON_DIR, DB_FILE, PID_FILE, SOCK_FILE } from './constants.ts';
import { sendShutdown } from './daemon-client.ts';

/**
 * Check whether a file exists at the given path.
 *
 * @param filePath - The path to check.
 * @returns True if the file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether the daemon process is currently running.
 *
 * @returns True if the daemon PID file exists and the process is alive.
 */
export async function isDaemonRunning(): Promise<boolean> {
  if (!(await fileExists(PID_FILE))) {
    return false;
  }
  try {
    const pid = Number((await readFile(PID_FILE, 'utf-8')).trim());
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the daemon PID from the PID file.
 *
 * @returns The daemon PID, or null if not available.
 */
export async function readDaemonPid(): Promise<number | null> {
  if (!(await fileExists(PID_FILE))) {
    return null;
  }
  try {
    return Number((await readFile(PID_FILE, 'utf-8')).trim());
  } catch {
    return null;
  }
}

/**
 * Clean up stale PID and socket files.
 */
async function cleanupStaleFiles(): Promise<void> {
  if (await fileExists(PID_FILE)) {
    await unlink(PID_FILE);
  }
  if (await fileExists(SOCK_FILE)) {
    await unlink(SOCK_FILE);
  }
}

/**
 * Start the daemon as a detached child process.
 *
 * @param daemonProcessPath - Absolute path to the daemon process entry point script.
 * @param logger - Logger instance.
 * @returns The PID of the forked daemon process.
 */
export async function startDaemon(
  daemonProcessPath: string,
  logger: Logger,
): Promise<number> {
  if (await isDaemonRunning()) {
    const pid = await readDaemonPid();
    throw new Error(`Daemon already running (PID ${pid})`);
  }

  await cleanupStaleFiles();
  await mkdir(DAEMON_DIR, { recursive: true });

  const child = fork(daemonProcessPath, [], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  const { pid } = child;
  if (pid === undefined) {
    throw new Error('Failed to start daemon: no PID returned');
  }

  // Wait for the socket file to appear, confirming startup
  const startTime = Date.now();
  const timeout = 10_000;
  while (!(await fileExists(SOCK_FILE))) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Daemon did not start within timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  logger.info(`Daemon started (PID ${pid})`);
  return pid;
}

/**
 * Stop a running daemon process.
 * Sends a shutdown RPC; falls back to SIGTERM if RPC fails.
 *
 * @param logger - Logger instance.
 */
export async function stopDaemon(logger: Logger): Promise<void> {
  if (!(await isDaemonRunning())) {
    throw new Error('Daemon is not running');
  }

  const pid = await readDaemonPid();

  try {
    await sendShutdown();
  } catch {
    // Fallback: send SIGTERM
    if (pid !== null) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // Process may have already exited
      }
    }
  }

  // Wait for the process to exit
  const startTime = Date.now();
  const exitTimeout = 5_000;
  while (await isDaemonRunning()) {
    if (Date.now() - startTime > exitTimeout) {
      // Force kill
      if (pid !== null) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Already exited
        }
      }
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await cleanupStaleFiles();
  logger.info('Daemon stopped');
}

/**
 * Delete the daemon database and its SQLite sidecar files.
 * Refuses to run if the daemon is currently active.
 *
 * @param logger - Logger instance.
 */
export async function flushDaemonStore(logger: Logger): Promise<void> {
  if (await isDaemonRunning()) {
    throw new Error('Cannot flush while daemon is running — stop it first');
  }

  const filesToDelete = [
    DB_FILE,
    `${DB_FILE}-wal`,
    `${DB_FILE}-shm`,
    `${DB_FILE}-journal`,
  ];

  for (const filePath of filesToDelete) {
    if (await fileExists(filePath)) {
      await unlink(filePath);
    }
  }

  logger.info('Daemon store flushed');
}
