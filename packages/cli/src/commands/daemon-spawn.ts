import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDaemonRunning } from './daemon-client.ts';

const POLL_INTERVAL_MS = 100;
const MAX_POLLS = 300; // 30 seconds

/**
 * Ensure the daemon is running. If it is not, spawn it as a detached process
 * and wait until the socket becomes responsive.
 *
 * @param socketPath - The UNIX socket path.
 */
export async function ensureDaemon(socketPath: string): Promise<void> {
  if (await isDaemonRunning(socketPath)) {
    return;
  }

  process.stderr.write('Starting daemon...\n');

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const entryPath = join(currentDir, 'daemon-entry.mjs');

  const child = spawn(process.execPath, [entryPath], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env, // eslint-disable-line n/no-process-env -- pass env to child
      OCAP_SOCKET_PATH: socketPath,
    },
  });
  child.unref();

  // Poll until daemon responds
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (await isDaemonRunning(socketPath)) {
      process.stderr.write('Daemon ready.\n');
      return;
    }
  }

  throw new Error(
    `Daemon did not start within ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`,
  );
}
