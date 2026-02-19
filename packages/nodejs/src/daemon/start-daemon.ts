import type { KernelDatabase } from '@metamask/kernel-store';
import type { Kernel } from '@metamask/ocap-kernel';

import { startRpcSocketServer } from './rpc-socket-server.ts';

/**
 * Options for starting the daemon.
 */
export type StartDaemonOptions = {
  /** UNIX socket path for the RPC server. */
  socketPath: string;
  /** A running kernel instance. */
  kernel: Kernel;
  /** The kernel database instance. */
  kernelDatabase: KernelDatabase;
  /** Optional callback invoked when a `shutdown` RPC is received. */
  onShutdown?: () => Promise<void>;
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
 * Starts a JSON-RPC socket server that exposes kernel control methods
 * on a UNIX domain socket.
 *
 * @param options - Configuration options.
 * @returns A daemon handle.
 */
export async function startDaemon(
  options: StartDaemonOptions,
): Promise<DaemonHandle> {
  const { socketPath, kernel, kernelDatabase, onShutdown } = options;

  const rpcServer = await startRpcSocketServer({
    socketPath,
    kernel,
    kernelDatabase,
    onShutdown,
  });

  const close = async (): Promise<void> => {
    await rpcServer.close();
    await kernel.stop();
    kernelDatabase.close();
  };

  return {
    kernel,
    socketPath,
    close,
  };
}
