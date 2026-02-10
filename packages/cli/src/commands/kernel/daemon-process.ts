/**
 * Daemon process entry point.
 * This file is forked as a detached child process by `startDaemon`.
 * It creates a kernel, starts the RPC server, and writes the PID file.
 */
import '@metamask/kernel-shims/endoify-node';

// These packages are used at runtime in the daemon process but cannot be
// listed as direct dependencies of @ocap/cli due to Turbo cyclic dependency
// constraints (they depend on @metamask/ocap-kernel).
/* eslint-disable import-x/no-extraneous-dependencies */
import { rpcHandlers } from '@metamask/kernel-browser-runtime';
import { RpcService } from '@metamask/kernel-rpc-methods';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { Logger } from '@metamask/logger';
import { Kernel } from '@metamask/ocap-kernel';
import {
  DB_FILE,
  PID_FILE,
  SOCK_FILE,
  LOG_FILE,
  createDaemonServer,
} from '@ocap/kernel-daemon';
import { NodejsPlatformServices } from '@ocap/nodejs';
/* eslint-enable import-x/no-extraneous-dependencies */
import { appendFile, writeFile, access, unlink } from 'node:fs/promises';
import type { Server } from 'node:net';

const logger = new Logger('kernel-daemon');

let server: Server | undefined;
let kernel: Kernel | undefined;

/**
 * Redirect logger output to log file.
 *
 * @param message - The message to log.
 * @param args - Additional arguments.
 */
async function logToFile(message: string, ...args: unknown[]): Promise<void> {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message} ${args.map(String).join(' ')}\n`;
  await appendFile(LOG_FILE, line);
}

/**
 * Check whether a file exists at the given path.
 *
 * @param filePath - The path to check.
 * @returns True if the file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Perform graceful shutdown: stop kernel, close server, clean up files.
 */
async function shutdown(): Promise<void> {
  await logToFile('Shutting down daemon...');

  if (kernel) {
    try {
      await kernel.stop();
    } catch (error) {
      await logToFile('Error stopping kernel:', String(error));
    }
  }

  if (server) {
    server.close();
  }

  if (await fileExists(PID_FILE)) {
    await unlink(PID_FILE);
  }
  if (await fileExists(SOCK_FILE)) {
    await unlink(SOCK_FILE);
  }

  // eslint-disable-next-line n/no-process-exit
  process.exit(0);
}

/**
 *
 */
async function main(): Promise<void> {
  await logToFile('Starting daemon process...');

  // Write PID file
  await writeFile(PID_FILE, String(process.pid));
  await logToFile(`PID ${process.pid} written to ${PID_FILE}`);

  // Create platform services
  const platformServices = new NodejsPlatformServices({
    logger: logger.subLogger({ tags: ['platform-services'] }),
  });

  // Create kernel database with persistent storage
  const kernelDatabase = await makeSQLKernelDatabase({
    dbFilename: DB_FILE,
  });

  // Create kernel
  kernel = await Kernel.make(platformServices, kernelDatabase, {
    logger: logger.subLogger({ tags: ['kernel'] }),
  });

  await logToFile('Kernel created successfully');

  // Initialize kernel identity (peer ID, crypto) for OCAP URL operations
  await kernel.initIdentity();
  await logToFile('Kernel identity initialized');

  // Build the RPC dispatcher from the standard kernel handlers
  const rpcService = new RpcService(rpcHandlers, {
    kernel,
    executeDBQuery: (sql: string) => kernelDatabase.executeQuery(sql),
  });

  // Start RPC server
  server = createDaemonServer({
    rpcDispatcher: rpcService,
    logger: logger.subLogger({ tags: ['rpc-server'] }),
    onShutdown: shutdown,
  });

  await logToFile('Daemon server started');

  // Register signal handlers for graceful shutdown
  process.on('SIGINT', () => {
    shutdown().catch(async (error) =>
      logToFile('Error during shutdown:', String(error)),
    );
  });
  process.on('SIGTERM', () => {
    shutdown().catch(async (error) =>
      logToFile('Error during shutdown:', String(error)),
    );
  });
}

main().catch(async (error) => {
  await logToFile('Fatal error starting daemon:', String(error));
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
});
