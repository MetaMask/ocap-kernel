/* eslint-disable n/no-process-exit, n/no-process-env, n/no-sync */
import '@metamask/kernel-shims/endoify-node';
import { Logger } from '@metamask/logger';
import type { LogEntry } from '@metamask/logger';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { bundleFile } from './bundle.ts';

/**
 * Create a file transport that writes logs to a file.
 *
 * @param logPath - The log file path.
 * @returns A log transport function.
 */
function makeFileTransport(logPath: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, n/global-require -- need sync fs for log transport
  const { appendFileSync } = require('node:fs') as typeof import('node:fs');
  return (entry: LogEntry): void => {
    const line = `[${new Date().toISOString()}] [${entry.level}] ${entry.message ?? ''} ${(entry.data ?? []).map(String).join(' ')}\n`;
    appendFileSync(logPath, line);
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
    const consoleName = process.env.OCAP_CONSOLE_NAME ?? 'system-console';

    // Bundle system console vat if needed
    const bundlesDir = join(ocapDir, 'bundles');
    await mkdir(bundlesDir, { recursive: true });

    const bundlePath = join(bundlesDir, 'system-console-vat.bundle');
    const cjsRequire = createRequire(import.meta.url);
    const kernelPkgPath = cjsRequire.resolve(
      '@metamask/ocap-kernel/package.json',
    );
    const vatSource = resolve(
      dirname(kernelPkgPath),
      'src/vats/system-console-vat.ts',
    );
    logger.info(`Bundling system console vat from ${vatSource}...`);
    await bundleFile(vatSource, { logger, targetPath: bundlePath });
    const bundleSpec = pathToFileURL(bundlePath).href;

    // Dynamically import to avoid pulling @ocap/nodejs into the CLI bundle graph
    // eslint-disable-next-line import-x/no-extraneous-dependencies -- workspace package
    const { startDaemon } = await import('@ocap/nodejs');

    const handle = await startDaemon({
      systemConsoleBundleSpec: bundleSpec,
      systemConsoleName: consoleName,
      socketPath,
      resetStorage: true,
      logger,
    });

    logger.info(`Daemon started. Socket: ${handle.socketPath}`);

    // Keep the process alive
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down...`);
      await handle.close();
      process.exit(0);
    };

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
