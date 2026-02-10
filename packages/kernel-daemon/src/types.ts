import type { Socket } from 'node:net';

/**
 * A connected daemon client wrapping an RPC client over a Unix socket.
 */
export type DaemonConnection = {
  client: {
    call(method: string, params: Record<string, unknown>): Promise<unknown>;
  };
  close: () => void;
  socket: Socket;
};

/**
 * Shutdown RPC method name.
 */
export const SHUTDOWN_METHOD = 'shutdown' as const;
