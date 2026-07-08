import '@metamask/kernel-shims/endoify-node';
import { makeKernel } from '@metamask/kernel-node-runtime';
import { startDaemon } from '@metamask/kernel-node-runtime/daemon';
import type { DaemonHandle } from '@metamask/kernel-node-runtime/daemon';
import type { LogEntry } from '@metamask/logger';
import { Logger } from '@metamask/logger';
import { appendFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getOcapHome } from '../ocap-home.ts';
import { isProcessAlive } from '../utils.ts';

// Install exit-cause handlers at module load, before main() runs, so
// failures during kernel init also leave a fingerprint. daemon-entry
// runs with `stdio: 'ignore'` under the CLI spawner (see
// `daemon-spawn.ts`); without these, an uncaught exception, an
// unhandled rejection, or a SIGHUP terminates the process silently
// with no record in `daemon.log`. Silent deaths cost real debugging
// time — see the run-notes for two past cases where a daemon
// disappeared with no trace. Every terminating path now writes at
// least one line before the process goes away.
installFatalHandlers(join(getOcapHome(), 'daemon.log'));

main().catch((error) => {
  process.stderr.write(`Daemon fatal: ${String(error)}\n`);
  process.exitCode = 1;
});

/**
 * Main daemon entry point. Starts the daemon process and keeps it running.
 */
async function main(): Promise<void> {
  const ocapDir = getOcapHome();
  await mkdir(ocapDir, { recursive: true });

  const logPath = join(ocapDir, 'daemon.log');
  const logger = new Logger({
    tags: ['daemon'],
    transports: [makeFileTransport(logPath)],
  });

  const socketPath =
    process.env.OCAP_SOCKET_PATH ?? join(ocapDir, 'daemon.sock');

  const dbFilename = join(ocapDir, 'kernel.sqlite');
  const { kernel, kernelDatabase } = await makeKernel({
    resetStorage: false,
    dbFilename,
    logger,
  });

  const pidPath = join(ocapDir, 'daemon.pid');

  // Interlock: refuse to start a second daemon under the same OCAP_HOME.
  // The socket-binding interlock in startDaemon handles the live-socket
  // case; this catches the rarer case where an orphan still holds the
  // kernel.sqlite locks but its socket file has already been unlinked.
  const existingPid = await readDaemonPid(pidPath);
  if (existingPid !== undefined && isProcessAlive(existingPid)) {
    throw new Error(
      `Daemon is already running (pid ${existingPid}) under ${ocapDir}. ` +
        `Use 'ocap daemon stop' first.`,
    );
  }
  if (existingPid !== undefined) {
    // Stale pid file — owner is dead, take over.
    await rm(pidPath, { force: true });
  }

  let handle: DaemonHandle;
  try {
    await kernel.initIdentity();
    await writeFile(pidPath, String(process.pid));

    handle = await startDaemon({
      socketPath,
      kernel,
      kernelDatabase,
      onShutdown: async () => shutdown('RPC shutdown'),
    });
  } catch (error) {
    try {
      kernel.stop().catch(() => undefined);
      kernelDatabase.close();
    } catch {
      // Best-effort cleanup.
    }
    rm(pidPath, { force: true }).catch(() => undefined);
    throw error;
  }

  logger.info(`Daemon started. Socket: ${handle.socketPath}`);

  let shutdownPromise: Promise<void> | undefined;
  /**
   * Shut down the daemon idempotently. Concurrent calls coalesce.
   *
   * @param reason - A label describing why shutdown was triggered.
   * @returns A promise that resolves when shutdown completes.
   */
  async function shutdown(reason: string): Promise<void> {
    if (shutdownPromise === undefined) {
      logger.info(`Shutting down (${reason})...`);
      shutdownPromise = handle.close().finally(() => {
        rm(pidPath, { force: true }).catch(() => undefined);
      });
    }
    return shutdownPromise;
  }

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch(() => (process.exitCode = 1));
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT').catch(() => (process.exitCode = 1));
  });
}

/**
 * Read the PID from `daemon.pid`, returning `undefined` if missing or
 * unparseable.
 *
 * @param pidPath - Path to the pid file.
 * @returns The parsed pid, or `undefined`.
 */
async function readDaemonPid(pidPath: string): Promise<number | undefined> {
  let raw: string;
  try {
    raw = await readFile(pidPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  const pid = Number(raw.trim());
  return Number.isFinite(pid) && pid > 0 ? pid : undefined;
}

/**
 * Create a file transport that writes logs to a file.
 *
 * @param logPath - The log file path.
 * @returns A log transport function.
 */
function makeFileTransport(logPath: string) {
  return (entry: LogEntry): void => {
    const line = `[${new Date().toISOString()}] [${entry.level}] ${entry.message ?? ''} ${(entry.data ?? []).map(String).join(' ')}\n`;
    // eslint-disable-next-line n/no-sync -- synchronous write needed for log transport reliability
    appendFileSync(logPath, line);
  };
}

/**
 * Append a fatal-path entry to `daemon.log` synchronously. Used from
 * `process.on('uncaughtException' | 'unhandledRejection' | 'SIGHUP')`
 * handlers where the async logger pipeline can't be trusted to
 * flush before the process exits. Best-effort: if the log file is
 * unwritable we swallow the error rather than throw from a fatal
 * handler.
 *
 * @param logPath - The daemon-log file path.
 * @param message - Short label for the entry.
 * @param detail - Optional extra data (stack, error, etc.) — coerced
 *   to string.
 */
function logFatalSync(
  logPath: string,
  message: string,
  detail?: string | number,
): void {
  try {
    const tail = detail === undefined ? '' : ` ${detail}`;
    const line = `[${new Date().toISOString()}] [error] ${message}${tail}\n`;
    // eslint-disable-next-line n/no-sync -- fatal handler must flush before exit
    appendFileSync(logPath, line);
  } catch {
    // Best-effort — the daemon is dying either way.
  }
}

/**
 * Install process-level handlers that guarantee a log line is
 * written for every terminating event before the daemon exits.
 *
 * Handlers registered:
 *
 * - `uncaughtException` — the classic silent-death path. Node's
 *   default is to print the stack to stderr and exit with code 1;
 *   under `stdio: 'ignore'` (how the daemon is spawned) that
 *   default writes nowhere.
 * - `unhandledRejection` — currently defaults to a warning in
 *   Node, but future Node versions treat it as uncaughtException;
 *   either way we want a fingerprint.
 * - `SIGHUP` — sent when the controlling terminal disappears
 *   (ssh session closed, laptop lid closed while the daemon was
 *   under an interactive shell). Default action terminates the
 *   process; installing a handler lets us log the fact before
 *   exiting.
 * - `exit` — last-ditch record. Fires during every exit, including
 *   the ones already logged by the handlers above. Sync-safe: only
 *   sync APIs are usable here.
 *
 * @param logPath - The daemon-log file path.
 */
function installFatalHandlers(logPath: string): void {
  /* eslint-disable n/no-sync, n/no-process-exit -- fatal handlers must flush synchronously and terminate deterministically */
  process.on('uncaughtException', (error: unknown) => {
    const detail =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    logFatalSync(logPath, 'Uncaught exception (about to exit):', detail);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason: unknown) => {
    const detail =
      reason instanceof Error
        ? (reason.stack ?? reason.message)
        : String(reason);
    logFatalSync(logPath, 'Unhandled rejection (about to exit):', detail);
    process.exit(1);
  });
  process.on('SIGHUP', () => {
    logFatalSync(logPath, 'SIGHUP received; exiting.');
    process.exit(0);
  });
  process.on('exit', (code) => {
    logFatalSync(logPath, `Process exiting (code=${code}).`);
  });
  /* eslint-enable n/no-sync, n/no-process-exit */
}
