/* eslint-disable n/no-process-env */

import { getOcapHome } from '@metamask/kernel-utils/nodejs';
import { join } from 'node:path';

import { getPluginDataDir } from './plugin.ts';

export { getOcapHome };

/**
 * Get the default daemon socket path.
 *
 * @returns The socket path.
 */
export function getSocketPath(): string {
  return join(getOcapHome(), 'daemon.sock');
}

/**
 * Absolute path to the `~/.ocap/caprock/` state directory.
 *
 * @returns The caprock plugin state directory.
 */
export function getCaprockDir(): string {
  return join(getOcapHome(), 'caprock');
}

/**
 * Preferred ocap binary path: `OCAP_BIN` env var, then the copy installed in
 * `CLAUDE_PLUGIN_DATA`, then falls back to `ocap` on `PATH`.
 *
 * @param pluginBinDir - The directory containing the running bin script.
 * @returns Absolute path to the ocap binary.
 */
export function getOcapBinPath(pluginBinDir: string): string {
  return (
    process.env.OCAP_BIN ??
    join(getPluginDataDir(pluginBinDir), 'node_modules', '.bin', 'ocap')
  );
}
