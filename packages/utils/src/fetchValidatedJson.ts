import type { Struct } from '@metamask/superstruct';
import { assert } from '@metamask/superstruct';

/**
 * Load and validate a cluster configuration file
 *
 * @param configUrl - Path to the config JSON file
 * @param validator - The validator to use to validate the config
 * @returns The validated cluster configuration
 */
export async function fetchValidatedJson<Type>(
  configUrl: string,
  validator: Struct<Type>,
): Promise<Type> {
  try {
    const response = await fetch(configUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch config: ${response.status} ${response.statusText}`,
      );
    }
    const config = await response.json();
    assert(config, validator);
    return config;
  } catch (error) {
    throw new Error(
      `Failed to load config from ${configUrl}: ${String(error)}`,
    );
  }
}
