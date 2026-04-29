import { startRelay } from '@metamask/kernel-utils/libp2p';
import { getLibp2pRelayHome } from '@metamask/kernel-utils/nodejs';
import type { Logger } from '@metamask/logger';
import { mkdir, rm, writeFile } from 'node:fs/promises';

import { isProcessAlive, readPidFile, sendSignal, waitFor } from '../utils.ts';

/**
 * Get the relay PID file path.
 *
 * @returns The relay PID file path.
 */
export function getRelayPidPath(): string {
  return `${getLibp2pRelayHome()}/relay.pid`;
}

/**
 * Get the relay address file path.
 *
 * @returns The relay address file path.
 */
export function getRelayAddrPath(): string {
  return `${getLibp2pRelayHome()}/relay.addr`;
}

/**
 * Remove the relay PID and address files.
 */
async function removeRelayFiles(): Promise<void> {
  await Promise.all([
    rm(getRelayPidPath(), { force: true }),
    rm(getRelayAddrPath(), { force: true }),
  ]);
}

/**
 * Start the relay server, write a PID file, and register signal handlers for
 * cleanup on exit.
 *
 * @param logger - The logger instance.
 */
export async function startRelayWithBookkeeping(logger: Logger): Promise<void> {
  await mkdir(getLibp2pRelayHome(), { recursive: true });

  const existingPid = await readPidFile(getRelayPidPath());
  if (existingPid !== undefined && isProcessAlive(existingPid)) {
    throw new Error(`Relay is already running (PID: ${existingPid}).`);
  }

  await writeFile(getRelayPidPath(), String(process.pid));

  let libp2p;
  try {
    libp2p = await startRelay(logger);
  } catch (error) {
    await removeRelayFiles();
    throw error;
  }

  try {
    const relayAddr = libp2p
      .getMultiaddrs()
      .find((ma) => ma.toString().includes('/ip4/127.0.0.1/tcp/9001/ws/'))
      ?.toString();
    if (relayAddr === undefined) {
      throw new Error(
        'Relay started but no WS multiaddr found on 127.0.0.1:9001',
      );
    }
    await writeFile(getRelayAddrPath(), relayAddr);
  } catch (error) {
    await Promise.resolve(libp2p.stop()).catch(() => undefined);
    await removeRelayFiles();
    throw error;
  }

  const cleanup = (): void => {
    Promise.resolve(libp2p.stop())
      .catch(() => undefined)
      .finally(() => {
        removeRelayFiles()
          .catch(() => undefined)
          // eslint-disable-next-line n/no-process-exit -- signal handler must force exit after cleanup
          .finally(() => process.exit(0));
      });
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}

/**
 * Print whether the relay process is running.
 */
export async function printRelayStatus(): Promise<void> {
  const pid = await readPidFile(getRelayPidPath());
  if (pid !== undefined && isProcessAlive(pid)) {
    process.stderr.write(`Relay is running (PID: ${pid}).\n`);
  } else {
    if (pid !== undefined) {
      await removeRelayFiles();
    }
    process.stderr.write('Relay is not running.\n');
    process.exitCode = 1;
  }
}

/**
 * Stop the relay process. Sends SIGTERM and waits; escalates to SIGKILL if
 * `force` is true and SIGTERM is ignored.
 *
 * @param options - Options.
 * @param options.force - Send SIGKILL if SIGTERM fails to stop the relay.
 * @returns True if the relay was stopped (or was not running), false otherwise.
 */
export async function stopRelay({
  force = false,
}: { force?: boolean } = {}): Promise<boolean> {
  const pid = await readPidFile(getRelayPidPath());

  if (pid === undefined || !isProcessAlive(pid)) {
    if (pid !== undefined) {
      await removeRelayFiles();
    }
    process.stderr.write('Relay is not running.\n');
    return true;
  }

  process.stderr.write('Stopping relay...\n');
  let stopped = false;

  // Strategy 1: SIGTERM.
  stopped = !sendSignal(pid, 'SIGTERM');
  if (!stopped) {
    stopped = await waitFor(() => !isProcessAlive(pid), 5_000);
  }

  // Strategy 2: SIGKILL (only with --force).
  if (!stopped && force) {
    stopped = !sendSignal(pid, 'SIGKILL');
    if (!stopped) {
      stopped = await waitFor(() => !isProcessAlive(pid), 2_000);
    }
  }

  if (stopped) {
    await removeRelayFiles();
    process.stderr.write('Relay stopped.\n');
  } else {
    process.stderr.write('Relay did not stop within timeout.\n');
  }
  return stopped;
}
