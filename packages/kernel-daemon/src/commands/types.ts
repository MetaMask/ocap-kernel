import type { Logger } from '@metamask/logger';

/**
 * Async getter for RPC method specifications.
 * Injected to avoid cyclic dependency on kernel-browser-runtime.
 */
export type GetMethodSpecs = () => Promise<Record<string, { method: string }>>;

/**
 * Configuration for registering daemon commands on a yargs instance.
 */
export type DaemonCommandsConfig = {
  logger: Logger;
  getMethodSpecs: GetMethodSpecs;
  daemonProcessPath: string;
};
