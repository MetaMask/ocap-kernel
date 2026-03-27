/* eslint-disable n/no-sync, n/no-process-env */
/**
 * Configure OpenClaw for the away node container.
 *
 * Writes the complete openclaw.json, auth profiles, and workspace
 * directories in a single pass — no `openclaw` CLI calls needed.
 * This replaces the fragile sequence of `openclaw onboard` +
 * `openclaw config set` calls that broke on every OpenClaw release.
 *
 * Env vars (all optional, with Docker-friendly defaults):
 *   LLM_BASE_URL   — LLM provider base URL (default: http://llm:11434)
 *   LLM_MODEL      — Model ID (default: qwen2.5:0.5b)
 *   LLM_API_TYPE   — OpenClaw API type: ollama | openai-completions | … (default: ollama)
 *
 * Usage:
 *   node /app/packages/evm-wallet-experiment/docker/setup-openclaw.mjs
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const home = process.env.HOME || '/run/ocap/away';
const ocDir = resolve(home, '.openclaw');

const llmBaseUrl = process.env.LLM_BASE_URL || 'http://llm:11434';
const llmModel = process.env.LLM_MODEL || 'qwen2.5:0.5b';
const llmApiType = process.env.LLM_API_TYPE || 'ollama';
const providerId = 'llm';
const pluginPath = '/app/packages/evm-wallet-experiment/openclaw-plugin';

// -- Directories (what `openclaw onboard` scaffolds) --
const dirs = [
  resolve(ocDir, 'workspace'),
  resolve(ocDir, 'agents/main/agent'),
  resolve(ocDir, 'agents/main/sessions'),
  resolve(ocDir, 'canvas'),
  resolve(ocDir, 'cron'),
  resolve(ocDir, 'extensions'),
];
for (const dir of dirs) {
  mkdirSync(dir, { recursive: true });
}

// -- Generate a gateway auth token --
const gatewayToken = randomBytes(24).toString('hex');

// -- Write openclaw.json (complete config, no patching) --
const config = {
  meta: {
    lastTouchedVersion: 'docker-setup',
    lastTouchedAt: new Date().toISOString(),
  },
  models: {
    mode: 'merge',
    providers: {
      [providerId]: {
        baseUrl: llmBaseUrl,
        api: llmApiType,
        models: [
          {
            id: llmModel,
            name: llmModel,
            reasoning: false,
            input: ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 32768,
            maxTokens: 8192,
          },
        ],
      },
    },
  },
  agents: {
    defaults: {
      model: { primary: `${providerId}/${llmModel}` },
      workspace: resolve(ocDir, 'workspace'),
      compaction: { mode: 'safeguard' },
    },
  },
  tools: {
    allow: [
      'wallet_balance',
      'wallet_send',
      'wallet_sign',
      'wallet_accounts',
      'wallet_capabilities',
      'wallet_swap_quote',
      'wallet_swap',
      'wallet_token_resolve',
      'wallet_token_balance',
      'wallet_token_send',
      'wallet_token_info',
    ],
  },
  commands: {
    native: 'auto',
    nativeSkills: 'auto',
    restart: true,
    ownerDisplay: 'raw',
  },
  session: { dmScope: 'per-channel-peer' },
  gateway: {
    port: 18789,
    mode: 'local',
    bind: 'loopback',
    auth: { mode: 'token', token: gatewayToken },
    tailscale: { mode: 'off', resetOnExit: false },
  },
  skills: { install: { nodeManager: 'npm' } },
  plugins: {
    allow: ['wallet'],
    load: { paths: [pluginPath] },
    entries: { wallet: { enabled: true } },
  },
};

const cfgPath = resolve(ocDir, 'openclaw.json');
writeFileSync(cfgPath, JSON.stringify(config, null, 2));
console.log(
  `[openclaw-setup] config written: ${providerId}/${llmModel} (api: ${llmApiType})`,
);

// -- Write auth profiles for the provider --
const authDir = resolve(ocDir, 'agents/main/agent');
const profiles = {
  version: 1,
  profiles: {
    [providerId]: {
      type: 'api_key',
      key: 'dummy',
      provider: providerId,
    },
  },
};
writeFileSync(
  resolve(authDir, 'auth-profiles.json'),
  JSON.stringify(profiles, null, 2),
);
console.log(`[openclaw-setup] auth profile written for: ${providerId}`);

// -- Verify plugin exists --
const pluginEntry = resolve(pluginPath, 'dist/index.mjs');
if (!existsSync(pluginEntry)) {
  console.error(
    `[openclaw-setup] WARN: plugin not found at ${pluginEntry} — wallet tools will not load`,
  );
}

console.log('[openclaw-setup] done');
