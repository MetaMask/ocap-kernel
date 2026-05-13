import {
  getSocketPath,
  sendCommand,
} from '@metamask/kernel-node-runtime/daemon';

export { getSocketPath, sendCommand };

/**
 * Check whether the daemon is running by sending a lightweight `getStatus`
 * RPC call. Unlike a bare socket probe, this avoids spurious connect/disconnect
 * noise on the server.
 *
 * @param socketPath - The UNIX socket path.
 * @returns True if the daemon responds to the RPC call.
 */
export async function pingDaemon(socketPath: string): Promise<boolean> {
  try {
    await sendCommand({ socketPath, method: 'getStatus', timeoutMs: 3_000 });
    return true;
  } catch {
    return false;
  }
}
