import { ifDefined } from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';
import type { Kernel, SystemSubclusterConfig } from '@metamask/ocap-kernel';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { makeKernel } from '../kernel/make-kernel.ts';

/**
 * Options for starting the daemon.
 */
export type StartDaemonOptions = {
  /** UNIX socket path for the system console IO channel. Defaults to ~/.ocap/console.sock. */
  socketPath?: string;
  /** URL to the bundled system-console-vat. */
  systemConsoleBundleSpec: string;
  /** Name for the system console subcluster. Defaults to 'system-console'. */
  systemConsoleName?: string;
  /** Path to vat worker file. */
  workerFilePath?: string;
  /** SQLite database filename. Defaults to ~/.ocap/kernel.sqlite. */
  dbFilename?: string;
  /** If true, clear kernel storage. */
  resetStorage?: boolean;
  /** Logger instance. */
  logger?: Logger;
  /** Seed for libp2p key generation. */
  keySeed?: string;
};

/**
 * Handle returned by {@link startDaemon}.
 */
export type DaemonHandle = {
  kernel: Kernel;
  socketPath: string;
  close: () => Promise<void>;
};

/**
 * Start the OCAP daemon.
 *
 * Creates a kernel with a system console vat that listens for commands
 * on a UNIX domain socket IO channel. The kernel process IS the daemon.
 *
 * @param options - Configuration options.
 * @returns A daemon handle.
 */
export async function startDaemon(
  options: StartDaemonOptions,
): Promise<DaemonHandle> {
  const {
    systemConsoleBundleSpec,
    systemConsoleName = 'system-console',
    workerFilePath,
    resetStorage,
    logger,
    keySeed,
  } = options;

  const ocapDir = join(homedir(), '.ocap');
  await mkdir(ocapDir, { recursive: true });

  const socketPath = options.socketPath ?? join(ocapDir, 'console.sock');
  const dbFilename = options.dbFilename ?? join(ocapDir, 'kernel.sqlite');

  // Build system subcluster config with IO channel for the console socket
  const systemSubcluster: SystemSubclusterConfig = {
    name: systemConsoleName,
    config: {
      bootstrap: systemConsoleName,
      io: {
        console: {
          type: 'socket' as const,
          path: socketPath,
        },
      },
      services: ['kernelFacet', 'console'],
      vats: {
        [systemConsoleName]: {
          bundleSpec: systemConsoleBundleSpec,
          parameters: { name: systemConsoleName },
        },
      },
    },
  };

  const kernel = await makeKernel({
    ...ifDefined({ workerFilePath, resetStorage, logger }),
    dbFilename,
    keySeed,
    systemSubclusters: [systemSubcluster],
  });

  await kernel.initIdentity();

  const close = async (): Promise<void> => {
    await kernel.stop();
  };

  return {
    kernel,
    socketPath,
    close,
  };
}
