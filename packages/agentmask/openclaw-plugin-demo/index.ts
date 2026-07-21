/**
 * OpenClaw demo plugin: provides bookkeeping tools (artifacts, wallet,
 * phase announcements) for the orchestration demo and posts events
 * to a `demo-display` server so the audience-facing dashboard updates
 * in real time.
 *
 * The wallet balance lives in the wallet vat inside the consumer
 * daemon on the VPS; this plugin talks to it via
 * `ocap daemon queueMessage` on a kref pre-redeemed from the
 * configured `walletUrl`.
 *
 * Config (in openclaw plugin settings or env vars):
 *   walletUrl               - OCAP URL of the wallet vat's public
 *                             facet. Optional; when unset the
 *                             plugin auto-discovers by reading
 *                             `<ocapHome>/wallet-url.env` (the file
 *                             `start-wallet.sh` writes). Explicit
 *                             config wins over the file.
 *   walletInitialBalanceUsd - Initial balance to write into the vat
 *                             at register-time so each rehearsal
 *                             starts from a known amount. Default
 *                             10000 ($10,000.00).
 *   ocapCliPath             - Absolute path to the ocap CLI
 *                             (default: monorepo-relative).
 *   ocapHome                - OCAP home for the daemon hosting the
 *                             wallet vat. Default ~/.ocap-consumer.
 *   timeoutMs               - Daemon-call timeout in ms
 *                             (default: 60000).
 *   displayUrl              - Base URL of the demo-display server.
 *                             Default http://127.0.0.1:7777.
 */
import {
  exactOptional,
  number,
  object,
  string,
  validate,
} from '@metamask/superstruct';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeDaemonCaller } from './daemon.ts';
import { makeDisplayClient } from './display-client.ts';
import { createState } from './state.ts';
import { registerAnnounceTool } from './tools/announce.ts';
import { registerGetArtifactTool } from './tools/get-artifact.ts';
import { registerPhaseStartedTool } from './tools/phase-started.ts';
import { registerRecordArtifactTool } from './tools/record-artifact.ts';
import { registerServiceCompletedTool } from './tools/service-completed.ts';
import { registerWalletBalanceTool } from './tools/wallet-balance.ts';
import { registerWalletCreditTool } from './tools/wallet-credit.ts';
import { registerWalletWithdrawTool } from './tools/wallet-payment.ts';
import type {
  OpenClawPluginApi,
  PluginConfigSchema,
  PluginEntry,
} from './types.ts';
import { makeWalletClient } from './wallet-client.ts';

const pluginDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLI = resolvePath(pluginDir, '../../kernel-cli/dist/app.mjs');
const DEFAULT_DISPLAY_URL = 'http://127.0.0.1:7777';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_WALLET_INITIAL_BALANCE_USD = 10_000;
const USD_TO_CENTS = 100;

const PluginConfigStruct = object({
  walletUrl: exactOptional(string()),
  walletInitialBalanceUsd: exactOptional(number()),
  ocapCliPath: exactOptional(string()),
  ocapHome: exactOptional(string()),
  timeoutMs: exactOptional(number()),
  displayUrl: exactOptional(string()),
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
      walletUrl: {
        type: 'string',
        description:
          "OCAP URL of the wallet vat's public facet. Optional. When " +
          'unset the plugin falls back to auto-discovery: reads ' +
          '`<ocapHome>/wallet-url.env` (the file ' +
          '`start-wallet.sh` writes on every launch) and picks up ' +
          'the URL from there. Set this explicitly only when you ' +
          "want to point the plugin at a wallet that isn't the one " +
          '`start-wallet.sh` most recently published.',
      },
      walletInitialBalanceUsd: {
        type: 'number',
        description:
          'Wallet balance to seed via `wallet.init()` at plugin ' +
          'register-time so each rehearsal starts from a known ' +
          'amount. Default 10000 ($10,000.00).',
      },
      ocapCliPath: {
        type: 'string',
        description:
          'Absolute path to the ocap CLI entry point (.mjs file or binary). ' +
          'Default: monorepo-relative from the plugin install location.',
      },
      ocapHome: {
        type: 'string',
        description:
          'OCAP home directory for the daemon hosting the wallet vat. ' +
          'Passed as `--home` on every spawned `ocap` invocation. ' +
          'Default: ~/.ocap-consumer.',
      },
      timeoutMs: {
        type: 'number',
        description: 'Timeout for daemon calls in ms (default: 60000).',
      },
      displayUrl: {
        type: 'string',
        description:
          'Base URL of the demo-display server. Default ' +
          'http://127.0.0.1:7777.',
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
 * Auto-discover the wallet OCAP URL by reading the `wallet-url.env`
 * file that `start-wallet.sh` writes into the consumer daemon's
 * home. Returns the URL if found, otherwise `undefined`. Absorbs
 * every error (missing file, unparseable content) — a permissible
 * failure means the operator hasn't run `start-wallet.sh` yet or
 * pointed the plugin at a different home.
 *
 * The file's line format is
 *   `setenv WALLET_OCAP_URL '<url>'`
 * (csh setenv, produced by `packages/orchestration-demo-vats/scripts/start-wallet.sh`).
 *
 * @param ocapHome - The consumer daemon's home directory.
 * @returns The wallet OCAP URL, or `undefined`.
 */
function autoDiscoverWalletUrl(ocapHome: string): string | undefined {
  try {
    const path = resolvePath(ocapHome, 'wallet-url.env');
    // Sync read is intentional: register() is a synchronous
    // callback under openclaw's plugin API, and the file is a
    // few dozen bytes — the async ceremony isn't worth it.
    // eslint-disable-next-line n/no-sync
    const contents = readFileSync(path, 'utf8');
    const match = /WALLET_OCAP_URL\s+['"]?([^'"\s]+)/u.exec(contents);
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    // fall through to return undefined
  }
  return undefined;
}

/**
 * Register all demo bookkeeping tools with the OpenClaw plugin API.
 * Kicks off (but does not await) wallet-URL redemption + a
 * balance-reset init call; wallet tools await this pending promise
 * via `requireWallet()` before their first vat call.
 *
 * @param api - The OpenClaw plugin API.
 */
function register(api: OpenClawPluginApi): void {
  const { pluginConfig } = api;

  const configuredWalletUrl = (
    resolveConfig<string>({
      pluginValue: pluginConfig?.walletUrl,
      envVar: 'DEMO_WALLET_OCAP_URL',
    }) ?? ''
  ).trim();

  const walletInitialBalanceUsd =
    resolveConfig<number>({
      pluginValue: pluginConfig?.walletInitialBalanceUsd,
      envVar: 'DEMO_WALLET_INITIAL_BALANCE_USD',
      parse: Number,
    }) ?? DEFAULT_WALLET_INITIAL_BALANCE_USD;
  const walletInitialBalanceCents = Math.round(
    walletInitialBalanceUsd * USD_TO_CENTS,
  );

  const cliPath =
    (
      resolveConfig<string>({
        pluginValue: pluginConfig?.ocapCliPath,
        envVar: 'OCAP_CLI_PATH',
      }) ?? ''
    ).trim() || DEFAULT_CLI;

  const ocapHome =
    (
      resolveConfig<string>({
        pluginValue: pluginConfig?.ocapHome,
        envVar: 'DEMO_OCAP_HOME',
      }) ?? ''
    ).trim() || resolvePath(homedir(), '.ocap-consumer');

  // Explicit config beats the file, so an operator can always
  // override the auto-discovery by setting
  // `plugins.entries.demo.config.walletUrl` (or the
  // DEMO_WALLET_OCAP_URL env var). If neither is set, fall back to
  // `<ocapHome>/wallet-url.env` — the file `start-wallet.sh` writes
  // on every launch. This is what makes the demo "just work" without
  // a per-cold-start openclaw-config-set step: the URL is stable
  // across rehearsal restarts (kref + peer id both persist), so the
  // file's contents change only on `reset-everything.sh` cycles, and
  // the plugin picks up whatever start-wallet.sh most recently wrote.
  const walletUrl =
    configuredWalletUrl || (autoDiscoverWalletUrl(ocapHome) ?? '');

  const timeoutMs =
    resolveConfig<number>({
      pluginValue: pluginConfig?.timeoutMs,
      envVar: 'OCAP_TIMEOUT_MS',
      parse: Number,
    }) ?? DEFAULT_TIMEOUT_MS;

  const displayUrl =
    (
      resolveConfig<string>({
        pluginValue: pluginConfig?.displayUrl,
        envVar: 'DEMO_DISPLAY_URL',
      }) ?? ''
    ).trim() || DEFAULT_DISPLAY_URL;

  const state = createState();
  const display = makeDisplayClient({ baseUrl: displayUrl });
  const daemon = makeDaemonCaller({ cliPath, ocapHome, timeoutMs });

  registerAnnounceTool({ api, display });
  registerRecordArtifactTool({ api, display });
  registerGetArtifactTool({ api });
  registerWalletBalanceTool({ api, state, display });
  registerWalletCreditTool({ api, state, display });
  registerWalletWithdrawTool({ api, state, display });
  registerPhaseStartedTool({ api, display });
  registerServiceCompletedTool({ api, display });

  // Kick off wallet-URL redemption + a balance-reset init call in
  // the background. Tools that need the wallet client await the
  // pending promise via `requireWallet()` — the discovery plugin
  // uses the same pattern for its matcher URL. Openclaw's plugin
  // context doesn't reliably let async work started here complete
  // *before* register() returns, so we can't await; parking a
  // promise in the state slot is the only reliable option.
  if (walletUrl) {
    const pending = (async () => {
      const walletKref = await daemon.redeemUrl(walletUrl);
      const client = makeWalletClient({ daemon, walletKref });
      // Reset the vat's balance so each rehearsal starts from a
      // known amount. `init` is idempotent.
      await client.init(walletInitialBalanceCents);
      state.wallet = { status: 'resolved', client, kref: walletKref };
      // eslint-disable-next-line no-console
      console.info(
        `[demo plugin] Wallet ready; kref=${walletKref}, initial balance=${walletInitialBalanceCents}c ($${walletInitialBalanceUsd.toLocaleString()})`,
      );
      // Push a wallet.balance event so the dashboard ribbon reflects
      // the freshly-initialised amount. Fire-and-forget: the display
      // may be unreachable at register time, but the ribbon also
      // updates on the first tool call that hits the vat.
      display
        .post({
          kind: 'wallet.balance',
          balanceCents: walletInitialBalanceCents,
        })
        .catch(() => undefined);
      return client;
    })();
    state.wallet = { status: 'pending', promise: pending };
    // Suppress unhandled-rejection warnings on paths that never
    // await the pending promise (e.g. gateway restart before any
    // tool call lands). requireWallet() re-throws on await.
    pending.catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error(
        `[demo plugin] Wallet redemption/init failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      '[demo plugin] No walletUrl found. Checked (in order): ' +
        '`plugins.entries.demo.config.walletUrl`, the ' +
        'DEMO_WALLET_OCAP_URL env var, and ' +
        `${resolvePath(ocapHome, 'wallet-url.env')}. Wallet tools ` +
        'will fail until one is populated. Run ' +
        '`packages/orchestration-demo-vats/scripts/start-wallet.sh` ' +
        'to publish the URL into the auto-discovery file.',
    );
  }

  // eslint-disable-next-line no-console
  console.info(
    `[demo plugin] Registered tools; display=${display.baseUrl}, ocapHome=${ocapHome}, walletUrl=${walletUrl || '(unset)'}`,
  );
}

const entry: PluginEntry = {
  id: 'demo',
  name: 'Orchestration Demo',
  description:
    'Bookkeeping tools (artifacts, wallet, phase announcements) for the ' +
    'orchestration demo. Talks to a wallet vat via the ocap CLI and posts ' +
    'events to demo-display so the audience-facing dashboard updates in ' +
    'real time.',
  configSchema,
  register,
};

export default entry;
