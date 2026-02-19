/* eslint-disable n/no-process-exit, n/no-process-env */
import '@metamask/kernel-shims/endoify-node';
import { Logger } from '@metamask/logger';
import type { LogEntry } from '@metamask/logger';
import { makeKernel } from '@ocap/nodejs';
import { startDaemon } from '@ocap/nodejs/daemon';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

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

  try {
    const socketPath =
      process.env.OCAP_SOCKET_PATH ?? join(ocapDir, 'console.sock');

    const { kernel, kernelDatabase } = await makeKernel({
      resetStorage: false,
      logger,
    });
    await kernel.initIdentity();

    // Write PID file so `ok daemon stop` can use it as a fallback
    const pidPath = join(ocapDir, 'daemon.pid');
    await writeFile(pidPath, String(process.pid));

    const shutdown = async (reason: string): Promise<void> => {
      logger.info(`Shutting down (${reason})...`);
      // eslint-disable-next-line @typescript-eslint/no-use-before-define -- shutdown is only called async, after handle is initialized
      await handle.close();
      await rm(pidPath, { force: true });
      process.exit(0);
    };

    const handle = await startDaemon({
      socketPath,
      kernel,
      kernelDatabase,
      onShutdown: async () => shutdown('RPC shutdown'),
    });

    logger.info(`Daemon started. Socket: ${handle.socketPath}`);

    process.on('SIGTERM', () => {
      shutdown('SIGTERM').catch(() => process.exit(1));
    });
    process.on('SIGINT', () => {
      shutdown('SIGINT').catch(() => process.exit(1));
    });
  } catch (error) {
    logger.error('Daemon startup failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`Daemon fatal: ${String(error)}\n`);
  process.exit(1);
});
