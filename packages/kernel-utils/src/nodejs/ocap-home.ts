import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Get the OCAP home directory. Defaults to `~/.ocap` unless overridden by the
 * `OCAP_HOME` environment variable.
 *
 * @returns The absolute path to the OCAP state directory.
 */
export function getOcapHome(): string {
  // eslint-disable-next-line n/no-process-env
  const envValue = process.env.OCAP_HOME;
  if (envValue) {
    return envValue;
  }
  return join(homedir(), '.ocap');
}
