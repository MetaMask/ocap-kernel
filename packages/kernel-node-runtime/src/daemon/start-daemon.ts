import type { KernelDatabase } from '@metamask/kernel-store';
import type { Kernel } from '@metamask/ocap-kernel';

import { startRpcSocketServer } from './rpc-socket-server.ts';
import type { SessionRegistry } from './session-registry.ts';
import { startStreamSocketServer } from './stream-socket-server.ts';
import type { ChannelFactory } from '../modal/index.ts';

/**
 * Options for starting the daemon.
 */
export type StartDaemonOptions = {
  /** UNIX socket path for the RPC server. */
  socketPath: string;
  /** UNIX socket path for the stream server (persistent TUI connections). */
  streamSocketPath: string;
  /** A running kernel instance. */
  kernel: Kernel;
  /** The kernel database instance. */
  kernelDatabase: KernelDatabase;
  /** Channel factory exo for modal session channels. */
  channelFactory: ChannelFactory;
  /** Session registry for CLI-created sessions. */
  sessionRegistry: SessionRegistry;
  /** Optional callback invoked when a `shutdown` RPC is received. */
  onShutdown?: () => Promise<void>;
};

/**
 * Handle returned by {@link startDaemon}.
 */
export type DaemonHandle = {
  kernel: Kernel;
  socketPath: string;
  streamSocketPath: string;
  close: () => Promise<void>;
};

/**
 * Start the OCAP daemon.
 *
 * Starts a JSON-RPC socket server that exposes kernel control methods on a
 * UNIX domain socket, and a separate stream socket server that accepts
 * persistent TUI subscriber connections.
 *
 * @param options - Configuration options.
 * @returns A daemon handle.
 */
export async function startDaemon(
  options: StartDaemonOptions,
): Promise<DaemonHandle> {
  const {
    socketPath,
    streamSocketPath,
    kernel,
    kernelDatabase,
    channelFactory,
    sessionRegistry,
    onShutdown,
  } = options;

  const [rpcServer, streamServer] = await Promise.all([
    startRpcSocketServer({
      socketPath,
      kernel,
      kernelDatabase,
      channelFactory,
      sessionRegistry,
      onShutdown,
    }),
    startStreamSocketServer({
      socketPath: streamSocketPath,
      getChannelByUrl: (url) => sessionRegistry.getChannelByUrl(url),
    }),
  ]);

  const close = async (): Promise<void> => {
    await Promise.all([rpcServer.close(), streamServer.close()]);
    await kernel.stop();
  };

  return {
    kernel,
    socketPath,
    streamSocketPath,
    close,
  };
}
