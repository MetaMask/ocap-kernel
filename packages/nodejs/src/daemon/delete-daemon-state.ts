import { rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Options for deleting daemon state.
 */
export type DeleteDaemonStateOptions = {
  /** UNIX socket path. Defaults to ~/.ocap/daemon.sock. */
  socketPath?: string;
  /** SQLite database filename. Defaults to ~/.ocap/kernel.sqlite. */
  dbFilename?: string;
};

/**
 * Delete all daemon state: kernel DB, bundles cache, and socket.
 *
 * @param options - Optional overrides for file paths.
 */
export async function deleteDaemonState(
  options?: DeleteDaemonStateOptions,
): Promise<void> {
  const ocapDir = join(homedir(), '.ocap');
  const socketPath = options?.socketPath ?? join(ocapDir, 'daemon.sock');
  const dbFilename = options?.dbFilename ?? join(ocapDir, 'kernel.sqlite');
  const bundlesDir = join(ocapDir, 'bundles');

  const pidPath = join(ocapDir, 'daemon.pid');
  const logPath = join(ocapDir, 'daemon.log');

  await Promise.all([
    rm(dbFilename, { force: true }),
    rm(socketPath, { force: true }),
    rm(bundlesDir, { recursive: true, force: true }),
    rm(pidPath, { force: true }),
    rm(logPath, { force: true }),
  ]);
}
