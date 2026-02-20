import '@metamask/kernel-shims/endoify-node';
import { Logger } from '@metamask/logger';
import type { LogEntry } from '@metamask/logger';
import { makeKernel } from '@ocap/nodejs';
import { startDaemon } from '@ocap/nodejs/daemon';
import type { DaemonHandle } from '@ocap/nodejs/daemon';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

main().catch((error) => {
  process.stderr.write(`Daemon fatal: ${String(error)}\n`);
  process.exitCode = 1;
});

/**
 * Main daemon entry point. Starts the daemon process and keeps it running.
 */
async function main(): Promise<void> {
  const ocapDir = join(homedir(), '.ocap');
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
 * Create a file transport that writes logs to a file.
 *
 * @param logPath - The log file path.
 * @returns A log transport function.
 */
function makeFileTransport(logPath: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, n/global-require -- need sync fs for log transport
  const fs = require('node:fs') as typeof import('node:fs');
  return (entry: LogEntry): void => {
    const line = `[${new Date().toISOString()}] [${entry.level}] ${entry.message ?? ''} ${(entry.data ?? []).map(String).join(' ')}\n`;
    // eslint-disable-next-line n/no-sync -- synchronous write needed for log transport reliability
    fs.appendFileSync(logPath, line);
  };
}
