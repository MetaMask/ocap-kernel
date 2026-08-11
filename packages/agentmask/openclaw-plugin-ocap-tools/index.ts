/**
 * OpenClaw `ocapTools` plugin: the agent's whole interface to an OCAP
 * kernel daemon, in two independent toolsets.
 *
 * - **discovery** (`discovery/`) — find services through a service matcher
 *   and consume them via the contact protocol defined in
 *   `@metamask/service-discovery-types`. Generic: nothing here is specific
 *   to any one demo, which is why it stays a separate skill.
 * - **orchestration** (`orchestration/`) — bookkeeping for the product
 *   orchestration demo (artifacts, wallet, phase announcements), posting
 *   events to a `demo-display` server for the audience-facing dashboard.
 *
 * They were previously two plugins (`discovery` and `demo`) carrying
 * byte-identical copies of the daemon caller, artifact store, and wire
 * types. Unifying them means one socket connection instead of two, one
 * place to configure `ocapHome`, and one copy of the shared plumbing. The
 * toolsets keep separate state modules because their state has nothing in
 * common — see `discovery/state.ts` and `orchestration/state.ts`.
 *
 * Config (in openclaw plugin settings or env vars; env wins):
 *   ocapHome                - OCAP home of the daemon to talk to. The
 *                             ocap-jsonrpc-vat socket is expected at
 *                             `<ocapHome>/ocap-jsonrpc.sock`.
 *                             Default: ~/.ocap-consumer.
 *   socketPath              - Override for the vat socket path (wins
 *                             over ocapHome).
 *   timeoutMs               - Daemon-call timeout in ms (default 60000).
 *   displayUrl              - Base URL of the demo-display server.
 *                             Default http://127.0.0.1:7777.
 *   matcherUrl              - OCAP URL of the service matcher. Optional;
 *                             redeemed eagerly at register time when set.
 *   walletUrl               - OCAP URL of the wallet vat's public facet.
 *                             Optional; auto-discovered from
 *                             `<ocapHome>/wallet-url.env` when unset.
 *   walletInitialBalanceUsd - Balance to seed at register time so each
 *                             rehearsal starts from a known amount.
 *                             Default 10000.
 *   resetState              - Clear plugin state on register.
 */
import {
  boolean,
  exactOptional,
  number,
  object,
  string,
  validate,
} from '@metamask/superstruct';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';

import { makeDaemonCaller } from './daemon.ts';
import { createState as createDiscoveryState } from './discovery/state.ts';
import { registerCallServiceTool } from './discovery/tools/call-service.ts';
import { registerFindServicesTool } from './discovery/tools/find-services.ts';
import { registerGetDescriptionTool } from './discovery/tools/get-description.ts';
import { registerInitiateContactTool } from './discovery/tools/initiate-contact.ts';
import { registerListTrackedTool } from './discovery/tools/list-tracked.ts';
import { registerRedeemMatcherTool } from './discovery/tools/redeem-matcher.ts';
import { makeDisplayClient } from './display-client.ts';
import { createState as createOrchestrationState } from './orchestration/state.ts';
import { registerAnnounceTool } from './orchestration/tools/announce.ts';
import { registerGetArtifactTool } from './orchestration/tools/get-artifact.ts';
import { registerPhaseStartedTool } from './orchestration/tools/phase-started.ts';
import { registerRecordArtifactTool } from './orchestration/tools/record-artifact.ts';
import { registerServiceCompletedTool } from './orchestration/tools/service-completed.ts';
import { registerWalletBalanceTool } from './orchestration/tools/wallet-balance.ts';
import { registerWalletCreditTool } from './orchestration/tools/wallet-credit.ts';
import { registerWalletWithdrawTool } from './orchestration/tools/wallet-withdraw.ts';
import type {
  OpenClawPluginApi,
  PluginConfigSchema,
  PluginEntry,
} from './types.ts';
import { makeWalletClient } from './wallet-client.ts';

const PLUGIN_ID = 'ocapTools';
const LOG_TAG = `[${PLUGIN_ID} plugin]`;
const DEFAULT_DISPLAY_URL = 'http://127.0.0.1:7777';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_WALLET_INITIAL_BALANCE_USD = 10_000;
const USD_TO_CENTS = 100;

const PluginConfigStruct = object({
  ocapHome: exactOptional(string()),
  socketPath: exactOptional(string()),
  timeoutMs: exactOptional(number()),
  displayUrl: exactOptional(string()),
  matcherUrl: exactOptional(string()),
  walletUrl: exactOptional(string()),
  walletInitialBalanceUsd: exactOptional(number()),
  resetState: exactOptional(boolean()),
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
      ocapHome: {
        type: 'string',
        description:
          'OCAP home directory of the daemon this plugin targets. The ' +
          'ocap-jsonrpc-vat socket is expected at ' +
          '`<ocapHome>/ocap-jsonrpc.sock`. Ignored if `socketPath` is set. ' +
          'Default: ~/.ocap-consumer.',
      },
      socketPath: {
        type: 'string',
        description:
          'Absolute filesystem path of the ocap-jsonrpc-vat Unix socket. ' +
          'Overrides `ocapHome` when set.',
      },
      timeoutMs: {
        type: 'number',
        description: 'Timeout for daemon calls in ms (default: 60000).',
      },
      displayUrl: {
        type: 'string',
        description:
          'Base URL of the demo-display server (e.g. ' +
          'http://127.0.0.1:7777). Discovery posts `service.discovered` ' +
          'events so the marketplace pane shows only providers the agent ' +
          'has actually queried; the orchestration tools post artifact, ' +
          'phase, and wallet events.',
      },
      matcherUrl: {
        type: 'string',
        description:
          'OCAP URL for the service matcher. Redeemed eagerly at register ' +
          'time when set, so the agent can call findServices without a ' +
          'separate redeem step.',
      },
      walletUrl: {
        type: 'string',
        description:
          "OCAP URL of the wallet vat's public facet. Optional. When " +
          'unset the plugin falls back to auto-discovery: reads ' +
          '`<ocapHome>/wallet-url.env` (the file `start-wallet.sh` writes ' +
          'on every launch). Set this explicitly only to point at a ' +
          "wallet that isn't the one `start-wallet.sh` most recently " +
          'published.',
      },
      walletInitialBalanceUsd: {
        type: 'number',
        description:
          'Wallet balance to seed via `wallet.init()` at register time so ' +
          'each rehearsal starts from a known amount. Default 10000 ' +
          '($10,000.00).',
      },
      resetState: {
        type: 'boolean',
        description: 'Clear plugin state on each register() call.',
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
 * Read a trimmed string setting from config or env.
 *
 * @param pluginValue - Value from plugin config.
 * @param envVar - Environment variable name.
 * @returns The trimmed value, or the empty string when unset.
 */
function stringSetting(pluginValue: unknown, envVar: string): string {
  return (resolveConfig<string>({ pluginValue, envVar }) ?? '').trim();
}

/**
 * Auto-discover the wallet OCAP URL by reading the `wallet-url.env` file
 * that `start-wallet.sh` writes into the daemon's home. Absorbs every
 * error (missing file, unparseable content): a failure here just means the
 * operator hasn't run `start-wallet.sh` yet, or pointed the plugin at a
 * different home.
 *
 * The file's line format is `setenv WALLET_OCAP_URL '<url>'` (csh setenv,
 * produced by
 * `packages/orchestration-demo-vats/scripts/start-wallet.sh`).
 *
 * @param ocapHome - The daemon's home directory.
 * @returns The wallet OCAP URL, or `undefined`.
 */
function autoDiscoverWalletUrl(ocapHome: string): string | undefined {
  try {
    const path = resolvePath(ocapHome, 'wallet-url.env');
    // Sync read is intentional: register() is a synchronous callback under
    // openclaw's plugin API, and the file is a few dozen bytes — the async
    // ceremony isn't worth it.
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
 * Eagerly redeem the configured matcher URL so the agent can call
 * findServices without a separate redeem step.
 *
 * The pending promise is parked in `state.matcher` so `requireMatcher()`
 * can await it if a tool call lands in the window between `register()`
 * returning and the redemption settling — openclaw's plugin context does
 * not reliably let async work started here finish before `register()`
 * returns, so parking a promise is the only dependable option.
 *
 * @param options - Redemption options.
 * @param options.url - The matcher OCAP URL to redeem.
 * @param options.daemon - The daemon caller.
 * @param options.state - The discovery state to park the promise in.
 */
function preRedeemMatcher(options: {
  url: string;
  daemon: ReturnType<typeof makeDaemonCaller>;
  state: ReturnType<typeof createDiscoveryState>;
}): void {
  const { url, daemon, state } = options;
  const pending = daemon.redeemUrl(url).then((ref) => {
    const entry = { url, ref };
    state.matcher = { status: 'resolved', entry };
    // eslint-disable-next-line no-console
    console.info(`${LOG_TAG} Pre-redeemed matcher URL; ref=${ref}`);
    return entry;
  });
  state.matcher = { status: 'pending', promise: pending };
  // Attach the failure handler to a chained promise rather than to
  // `pending` itself, so `pending` stays rejectable for any
  // `requireMatcher()` call that does await it.
  pending.catch((error: unknown) => {
    // Only revert to 'absent' if the slot is still 'pending' on *this*
    // promise — a manual redeem may have already moved it forward.
    if (
      state.matcher.status === 'pending' &&
      state.matcher.promise === pending
    ) {
      state.matcher = { status: 'absent' };
    }
    // eslint-disable-next-line no-console
    console.warn(`${LOG_TAG} Failed to pre-redeem matcher URL:`, error);
  });
}

/**
 * Redeem the wallet URL and seed its balance, parking the pending promise
 * in `state.wallet` for `requireWallet()` to await. Same
 * cannot-await-in-register constraint as {@link preRedeemMatcher}.
 *
 * @param options - Redemption options.
 * @param options.url - The wallet OCAP URL to redeem.
 * @param options.daemon - The daemon caller.
 * @param options.state - The orchestration state to park the promise in.
 * @param options.display - Display client for the balance event.
 * @param options.initialBalanceCents - Balance to seed, in cents.
 */
function preRedeemWallet(options: {
  url: string;
  daemon: ReturnType<typeof makeDaemonCaller>;
  state: ReturnType<typeof createOrchestrationState>;
  display: ReturnType<typeof makeDisplayClient>;
  initialBalanceCents: number;
}): void {
  const { url, daemon, state, display, initialBalanceCents } = options;
  const pending = (async () => {
    const walletRef = await daemon.redeemUrl(url);
    const client = makeWalletClient({ daemon, walletRef });
    // Reset the vat's balance so each rehearsal starts from a known
    // amount. `init` is idempotent.
    await client.init(initialBalanceCents);
    state.wallet = { status: 'resolved', client, ref: walletRef };
    // eslint-disable-next-line no-console
    console.info(
      `${LOG_TAG} Wallet ready; ref=${walletRef}, initial balance=${initialBalanceCents}c`,
    );
    // Fire-and-forget: the display may be unreachable at register time,
    // and the ribbon also updates on the first tool call that hits the vat.
    display
      .post({ kind: 'wallet.balance', balanceCents: initialBalanceCents })
      .catch(() => undefined);
    return client;
  })();
  state.wallet = { status: 'pending', promise: pending };
  // Suppress unhandled-rejection warnings on paths that never await the
  // pending promise (e.g. a gateway restart before any tool call lands).
  // `requireWallet()` re-throws on await.
  pending.catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(
      `${LOG_TAG} Wallet redemption/init failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
}

/**
 * Register both toolsets with the OpenClaw plugin API.
 *
 * One daemon caller is shared by both: they address the same
 * ocap-jsonrpc-vat socket, and a single connection is the point of having
 * one plugin rather than two.
 *
 * @param api - The OpenClaw plugin API.
 */
function register(api: OpenClawPluginApi): void {
  const { pluginConfig } = api;

  const ocapHome =
    stringSetting(pluginConfig?.ocapHome, 'OCAP_HOME') ||
    resolvePath(homedir(), '.ocap-consumer');
  const explicitSocketPath = stringSetting(
    pluginConfig?.socketPath,
    'OCAP_JSONRPC_SOCKET',
  );
  const matcherUrl = stringSetting(
    pluginConfig?.matcherUrl,
    'MATCHER_OCAP_URL',
  );
  const configuredWalletUrl = stringSetting(
    pluginConfig?.walletUrl,
    'DEMO_WALLET_OCAP_URL',
  );
  const displayUrl =
    stringSetting(pluginConfig?.displayUrl, 'DEMO_DISPLAY_URL') ||
    DEFAULT_DISPLAY_URL;

  const timeoutMs =
    resolveConfig<number>({
      pluginValue: pluginConfig?.timeoutMs,
      envVar: 'OCAP_TIMEOUT_MS',
      parse: Number,
    }) ?? DEFAULT_TIMEOUT_MS;

  const walletInitialBalanceUsd =
    resolveConfig<number>({
      pluginValue: pluginConfig?.walletInitialBalanceUsd,
      envVar: 'DEMO_WALLET_INITIAL_BALANCE_USD',
      parse: Number,
    }) ?? DEFAULT_WALLET_INITIAL_BALANCE_USD;

  const resetState =
    resolveConfig<boolean>({
      pluginValue: pluginConfig?.resetState,
      envVar: 'OCAP_RESET_STATE',
      parse: (value) => value.toLowerCase() === 'true',
    }) ?? false;

  if (resetState) {
    // eslint-disable-next-line no-console
    console.info(`${LOG_TAG} State reset enabled — starting clean.`);
  }

  // Explicit config beats the file, so an operator can always override
  // auto-discovery via `plugins.entries.ocapTools.config.walletUrl` or
  // DEMO_WALLET_OCAP_URL. Falling back to `<ocapHome>/wallet-url.env` is
  // what makes the demo work without a per-cold-start config step: the URL
  // is stable across rehearsal restarts (kref and peer id both persist),
  // so the file changes only on `reset-everything.sh` cycles.
  const walletUrl =
    configuredWalletUrl || (autoDiscoverWalletUrl(ocapHome) ?? '');

  const socketPath = explicitSocketPath || join(ocapHome, 'ocap-jsonrpc.sock');
  const daemon = makeDaemonCaller({ socketPath, timeoutMs });
  const display = makeDisplayClient({ baseUrl: displayUrl });

  const discoveryState = createDiscoveryState();
  const orchestrationState = createOrchestrationState();

  // discovery toolset
  registerRedeemMatcherTool({ api, daemon, state: discoveryState });
  registerFindServicesTool({
    api,
    daemon,
    state: discoveryState,
    displayClient: display,
  });
  registerGetDescriptionTool({ api, daemon, state: discoveryState });
  registerInitiateContactTool({ api, daemon, state: discoveryState });
  registerCallServiceTool({ api, daemon, state: discoveryState });
  registerListTrackedTool({ api, state: discoveryState });

  // orchestration toolset
  registerAnnounceTool({ api, display });
  registerRecordArtifactTool({ api, display });
  registerGetArtifactTool({ api });
  registerWalletBalanceTool({ api, state: orchestrationState, display });
  registerWalletCreditTool({ api, state: orchestrationState, display });
  registerWalletWithdrawTool({ api, state: orchestrationState, display });
  registerPhaseStartedTool({ api, display });
  registerServiceCompletedTool({ api, display });

  if (matcherUrl) {
    preRedeemMatcher({ url: matcherUrl, daemon, state: discoveryState });
  }

  if (walletUrl) {
    preRedeemWallet({
      url: walletUrl,
      daemon,
      state: orchestrationState,
      display,
      initialBalanceCents: Math.round(walletInitialBalanceUsd * USD_TO_CENTS),
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      `${LOG_TAG} No walletUrl found. Checked (in order): ` +
        '`plugins.entries.ocapTools.config.walletUrl`, the ' +
        'DEMO_WALLET_OCAP_URL env var, and ' +
        `${resolvePath(ocapHome, 'wallet-url.env')}. Wallet tools will ` +
        'fail until one is populated. Run ' +
        '`packages/orchestration-demo-vats/scripts/start-wallet.sh` to ' +
        'publish the URL into the auto-discovery file.',
    );
  }

  // eslint-disable-next-line no-console
  console.info(
    `${LOG_TAG} Registered tools; socket=${socketPath}, display=${display.baseUrl}, matcherUrl=${matcherUrl || '(unset)'}, walletUrl=${walletUrl || '(unset)'}`,
  );
}

const entry: PluginEntry = {
  id: PLUGIN_ID,
  name: 'OCAP Tools',
  description:
    'Service discovery and product-orchestration tools for an OCAP kernel ' +
    'daemon. Find and consume services via a service matcher and the ' +
    'contact protocol, plus demo bookkeeping (artifacts, wallet, phase ' +
    'announcements) posted to demo-display.',
  configSchema,
  register,
};

export default entry;
