/* eslint-disable n/no-process-env */
/**
 * caprock — Claude Code CLI hook handler.
 *
 * Entry point only: installs the harden shim, reads JSON from stdin, builds
 * the production HookDeps bag, and delegates to the dispatcher. The decision
 * logic lives in `src/handlers/`.
 */

import './harden-shim.ts';

import { spawn } from 'node:child_process';
import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { dispatch } from '../src/handlers/dispatch.ts';
import type { HookDeps, SessionStore } from '../src/handlers/types.ts';
import {
  getCaprockDir,
  getSocketPath,
  getOcapBinPath,
} from '../src/paths/ocap-kernel.ts';
import {
  getPluginRoot,
  getVatBundlePath,
  getProjectSettingsLocalPath,
} from '../src/paths/plugin.ts';
import { getClaudeDir, getClaudeSettingsPath } from '../src/paths/user.ts';
import { defaultRpcClient, pingDaemon } from '../src/rpc.ts';
import {
  loadSessionState,
  saveSessionState,
  appendEvent,
  readEvents,
  readSettingsAllowList,
  readSettingsDenyList,
} from '../src/session.ts';
import type { AnyHookPayload } from '../src/types.ts';

const SOCKET_PATH = getSocketPath();
const BIN_DIR = import.meta.dirname;
const VAT_BUNDLE = getVatBundlePath(BIN_DIR);

// CLAUDE_PROJECT_DIR is exported by Claude Code to hook processes and points
// at the workspace root; fall back to the plugin root for standalone use.
const SETTINGS_PATHS = [
  getClaudeSettingsPath(),
  getProjectSettingsLocalPath(BIN_DIR),
];

const sessionStore: SessionStore = {
  loadSessionState,
  saveSessionState,
  appendEvent,
  readEvents,
  readSettingsAllowList,
  readSettingsDenyList,
};

/**
 * Read all bytes from stdin and return them as a UTF-8 string.
 *
 * @returns The stdin content.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Ensure the ocap-kernel daemon is running, starting it if not. */
async function ensureDaemon(): Promise<void> {
  if (await pingDaemon(SOCKET_PATH)) {
    return;
  }

  const ocapBin = getOcapBinPath(BIN_DIR);
  let resolvedBin = ocapBin;
  try {
    await access(ocapBin);
  } catch {
    resolvedBin = 'ocap'; // fall back to PATH
  }

  const isScript = resolvedBin.endsWith('.mjs') || resolvedBin.endsWith('.cjs');
  const cmd = isScript ? 'node' : resolvedBin;
  const cmdArgs = isScript
    ? [resolvedBin, 'daemon', 'start']
    : ['daemon', 'start'];

  const child = spawn(cmd, cmdArgs, {
    env: { ...process.env, OCAP_SOCKET_PATH: SOCKET_PATH },
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () => {
    process.stderr.write(
      '[caprock] `ocap` binary not found. Install @metamask/kernel-cli or set OCAP_BIN.\n',
    );
  });
  child.unref();
}

/**
 * Add the allow rule for this plugin's status skill to `~/.claude/settings.json`.
 * Runs from the SessionStart hook so no permission check applies to the write.
 * Uses a glob over the version segment so the rule survives plugin updates.
 */
async function registerSkillPermissions(): Promise<void> {
  if (!process.env.CLAUDE_PLUGIN_ROOT) {
    return;
  }
  const pluginRoot = getPluginRoot(BIN_DIR);

  const settingsPath = getClaudeSettingsPath();
  let settings: { permissions?: { allow?: string[] } } = {};
  try {
    settings = JSON.parse(
      await readFile(settingsPath, 'utf8'),
    ) as typeof settings;
  } catch {
    /* file absent or unparseable — start fresh */
  }

  const current = settings.permissions?.allow ?? [];
  const versionGlob = pluginRoot.replace(/\/\d+\.\d+\.\d+$/u, '/*');
  const newEntries = [
    `Bash(${versionGlob}/scripts/status.sh *)`,
    `Bash(${versionGlob}/scripts/setup.sh)`,
    `Bash(${versionGlob}/scripts/audit.sh)`,
  ].filter((entry) => !current.includes(entry));

  if (newEntries.length === 0) {
    return;
  }

  settings.permissions ??= {};
  settings.permissions.allow = [...current, ...newEntries];
  await mkdir(getClaudeDir(), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

const deps: HookDeps = {
  rpc: defaultRpcClient,
  store: sessionStore,
  now: () => new Date().toISOString(),
  stdout: (chunk) => process.stdout.write(chunk),
  stderr: (chunk) => process.stderr.write(chunk),
  socketPath: SOCKET_PATH,
  vatBundlePath: VAT_BUNDLE,
  settingsPaths: SETTINGS_PATHS,
  ensureDaemon,
  registerSkillPermissions,
  writeConnectFile: async (cmd) =>
    writeFile(join(getCaprockDir(), 'connect'), `${cmd}\n`),
  caprockJsonlPath: (sessionId) => join(getCaprockDir(), `${sessionId}.jsonl`),
};

/** Read stdin, dispatch to the matching hook handler, and write the response. */
async function main(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) {
    return;
  }

  let payload: AnyHookPayload;
  try {
    payload = JSON.parse(raw) as AnyHookPayload;
  } catch {
    process.stderr.write(
      `[caprock] Invalid JSON on stdin: ${raw.slice(0, 80)}\n`,
    );
    return;
  }

  try {
    await dispatch(payload, deps);
  } catch (error) {
    process.stderr.write(
      `[caprock] Error in ${payload.hook_event_name}: ${String(error)}\n`,
    );
  }
}

main().catch((error) => {
  process.stderr.write(`[caprock] Fatal: ${String(error)}\n`);
});
