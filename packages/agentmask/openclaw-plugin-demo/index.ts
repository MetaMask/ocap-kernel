/**
 * OpenClaw demo plugin: provides bookkeeping tools (artifacts, wallet,
 * phase announcements) for the orchestration demo and posts events
 * to a `demo-display` server so the audience-facing dashboard updates
 * in real time.
 *
 * Config (optional, in openclaw plugin settings or env vars):
 *   displayUrl              - Base URL of the demo-display server.
 *                             Default http://127.0.0.1:7777.
 *   walletInitialBalanceUsd - Starting wallet balance. Default 10000.
 *
 * The plugin is intentionally minimal: it registers four tools the
 * agent calls directly. It does NOT auto-tap the discovery plugin's
 * tool calls (openclaw doesn't expose a cross-plugin call observer);
 * the agent's own `demo_announce` narration is the transcript source.
 */
import {
  exactOptional,
  number,
  object,
  string,
  validate,
} from '@metamask/superstruct';

import { makeDisplayClient } from './display-client.ts';
import { createState } from './state.ts';
import { registerAnnounceTool } from './tools/announce.ts';
import { registerGetArtifactTool } from './tools/get-artifact.ts';
import { registerRecordArtifactTool } from './tools/record-artifact.ts';
import { registerWalletBalanceTool } from './tools/wallet-balance.ts';
import type {
  OpenClawPluginApi,
  PluginConfigSchema,
  PluginEntry,
} from './types.ts';

const DEFAULT_DISPLAY_URL = 'http://127.0.0.1:7777';
const DEFAULT_WALLET_INITIAL_BALANCE_USD = 10_000;

const PluginConfigStruct = object({
  displayUrl: exactOptional(string()),
  walletInitialBalanceUsd: exactOptional(number()),
});

const configSchema: PluginConfigSchema = {
  safeParse(value: unknown) {
    if (value === undefined) {
      return { success: true, data: undefined };
    }
    const [error, validated] = validate(value, PluginConfigStruct);
    if (error) {
      return {
        success: false,
        error: {
          issues: error.failures().map((failure) => ({
            path: failure.path,
            message: failure.message,
          })),
        },
      };
    }
    return { success: true, data: validated };
  },
  jsonSchema: {
    type: 'object',
    properties: {
      displayUrl: {
        type: 'string',
        description:
          'Base URL of the demo-display server. Default ' +
          'http://127.0.0.1:7777.',
      },
      walletInitialBalanceUsd: {
        type: 'number',
        description:
          'Initial wallet balance the agent sees on `demo_wallet_balance`. ' +
          'Default 10000.',
      },
    },
    additionalProperties: false,
  },
};

/**
 * Resolve a config value from plugin config and env var, env wins.
 *
 * @param options - Resolution options.
 * @param options.pluginValue - Value from plugin config.
 * @param options.envVar - Environment variable name.
 * @param options.parse - Optional parser for the env var string.
 * @returns The resolved value, or undefined.
 */
function resolveConfig<Type>(options: {
  pluginValue: unknown;
  envVar: string;
  parse?: (value: string) => Type;
}): Type | undefined {
  // eslint-disable-next-line n/no-process-env
  const envValue = process.env[options.envVar];
  if (envValue !== undefined && envValue !== '') {
    return options.parse ? options.parse(envValue) : (envValue as Type);
  }
  return options.pluginValue as Type | undefined;
}

/**
 * Register all demo bookkeeping tools with the OpenClaw plugin API,
 * and post a `wallet.balance` event so demo-display's wallet ribbon
 * shows the initial value.
 *
 * @param api - The OpenClaw plugin API.
 */
function register(api: OpenClawPluginApi): void {
  const { pluginConfig } = api;

  const displayUrl =
    (
      resolveConfig<string>({
        pluginValue: pluginConfig?.displayUrl,
        envVar: 'DEMO_DISPLAY_URL',
      }) ?? ''
    ).trim() || DEFAULT_DISPLAY_URL;

  const walletInitialBalanceUsd =
    resolveConfig<number>({
      pluginValue: pluginConfig?.walletInitialBalanceUsd,
      envVar: 'DEMO_WALLET_INITIAL_BALANCE_USD',
      parse: Number,
    }) ?? DEFAULT_WALLET_INITIAL_BALANCE_USD;

  const state = createState({ initialBalanceUsd: walletInitialBalanceUsd });
  const display = makeDisplayClient({ baseUrl: displayUrl });

  registerAnnounceTool({ api, display });
  registerRecordArtifactTool({ api, state, display });
  registerGetArtifactTool({ api, state });
  registerWalletBalanceTool({ api, state });

  // Surface the initial wallet balance to demo-display so the wallet
  // ribbon shows a value before the agent's first read. Fire-and-
  // forget: if demo-display is down at register time, the ribbon
  // stays empty until the first balance change (a future enhancement
  // will retry on connect).
  display
    .post({ kind: 'wallet.balance', balanceUsd: state.balanceUsd })
    .catch(() => undefined);

  // eslint-disable-next-line no-console
  console.info(
    `[demo plugin] Registered tools; display=${display.baseUrl}, wallet=$${state.balanceUsd.toLocaleString()}`,
  );
}

const entry: PluginEntry = {
  id: 'demo',
  name: 'Orchestration Demo',
  description:
    'Bookkeeping tools (artifacts, wallet, phase announcements) for the ' +
    'orchestration demo. Posts events to demo-display so the audience-' +
    'facing dashboard updates in real time.',
  configSchema,
  register,
};

export default entry;
