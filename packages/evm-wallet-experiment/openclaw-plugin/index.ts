/**
 * OpenClaw wallet plugin: registers tools that forward to the OCAP daemon.
 *
 * The OCAP daemon runs the evm-wallet subcluster. This plugin sends JSON-RPC
 * messages to the daemon over its Unix socket, routing wallet operations
 * through the kernel's capability system. The AI agent never touches keys.
 *
 * Enable tools via agents.list[].tools.allow: ["wallet_balance", "wallet_send"]
 * or allow all with ["wallet"].
 *
 * Config (optional, in openclaw plugin settings):
 *   ocapCliPath  - Absolute path to the `ocap` CLI (auto-detected from monorepo)
 *   walletKref   - The kernel reference for the wallet coordinator (default: "ko4")
 */
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeWalletCaller } from './daemon.ts';
import { registerEthTools } from './tools/eth.ts';
import { registerMiscTools } from './tools/misc.ts';
import { registerSwapTools } from './tools/swap.ts';
import { registerTokenTools } from './tools/token.ts';
import type { OpenClawPluginApi } from './types.ts';

const pluginDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLI = resolvePath(pluginDir, '../../kernel-cli/dist/app.mjs');
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Register the wallet plugin tools.
 *
 * @param api - The OpenClaw plugin API.
 */
export default function register(api: OpenClawPluginApi): void {
  const { pluginConfig } = api;
  const cliPath =
    typeof pluginConfig?.ocapCliPath === 'string'
      ? pluginConfig.ocapCliPath.trim()
      : DEFAULT_CLI;
  const walletKref =
    typeof pluginConfig?.walletKref === 'string'
      ? pluginConfig.walletKref.trim()
      : 'ko4';
  const timeoutMs =
    typeof pluginConfig?.timeoutMs === 'number'
      ? pluginConfig.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  const wallet = makeWalletCaller({ cliPath, walletKref, timeoutMs });

  registerEthTools(api, wallet);
  registerTokenTools(api, wallet);
  registerSwapTools(api, wallet);
  registerMiscTools(api, wallet);
}
