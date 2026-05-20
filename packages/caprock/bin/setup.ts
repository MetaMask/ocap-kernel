/* eslint-disable no-console */
import { execSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

import { getSocketPath } from '../src/paths/ocap-kernel.ts';
import { getPluginManifestPath } from '../src/paths/plugin.ts';
import { getClaudeSettingsPath } from '../src/paths/user.ts';
import { pingDaemon } from '../src/rpc.ts';

const BIN_DIR = import.meta.dirname;
const PLUGIN_ROOT = join(BIN_DIR, '..');
const SOCKET_PATH = getSocketPath();

/**
 * Print a success check line to stdout.
 *
 * @param message - The message to display.
 */
function ok(message: string): void {
  console.log(`  ✓  ${message}`);
}

/**
 * Print a failure check line to stdout.
 *
 * @param message - The message to display.
 */
function fail(message: string): void {
  console.log(`  ✗  ${message}`);
}

/**
 * Print an info line to stdout.
 *
 * @param message - The message to display.
 */
function info(message: string): void {
  console.log(`     ${message}`);
}

/**
 * Read the plugin version from its manifest.
 *
 * @returns The version string, or 'unknown' if the manifest is unreadable.
 */
async function readVersion(): Promise<string> {
  try {
    const manifest = JSON.parse(
      await readFile(getPluginManifestPath(BIN_DIR), 'utf8'),
    ) as { version?: string };
    return manifest.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Check that the tree-sitter native binding is compiled.
 *
 * @returns True if the binding is present or was successfully rebuilt.
 */
async function checkTreeSitter(): Promise<boolean> {
  const bindingPath = join(
    PLUGIN_ROOT,
    'node_modules/tree-sitter/build/Release/tree_sitter_runtime_binding.node',
  );
  try {
    await access(bindingPath);
    ok('tree-sitter native binding compiled');
    return true;
  } catch {
    fail('tree-sitter native binding missing — attempting npm rebuild...');
    try {
      // eslint-disable-next-line n/no-sync
      execSync('npm rebuild tree-sitter tree-sitter-bash', {
        cwd: PLUGIN_ROOT,
        stdio: 'pipe',
      });
      await access(bindingPath);
      ok('tree-sitter rebuilt successfully');
      return true;
    } catch {
      fail('npm rebuild failed');
      info(
        'Ensure Xcode Command Line Tools are installed: xcode-select --install',
      );
      return false;
    }
  }
}

/**
 * Check that the ocap-kernel daemon is reachable.
 *
 * @returns True if the daemon responds to a ping.
 */
async function checkDaemon(): Promise<boolean> {
  if (await pingDaemon(SOCKET_PATH)) {
    ok(`ocap-kernel daemon running (${SOCKET_PATH})`);
    return true;
  }
  fail('ocap-kernel daemon not running');
  info(
    'It starts automatically at SessionStart — open a new Claude Code session to trigger it.',
  );
  return false;
}

/**
 * Check that the caprock status.sh allow entry is in Claude settings.
 *
 * @returns True if the allow entry is present.
 */
async function checkAllowEntry(): Promise<boolean> {
  let settings: { permissions?: { allow?: string[] } } = {};
  try {
    settings = JSON.parse(
      await readFile(getClaudeSettingsPath(), 'utf8'),
    ) as typeof settings;
  } catch {
    fail('Could not read ~/.claude/settings.json');
    return false;
  }
  const allow = settings.permissions?.allow ?? [];
  const hasEntry = allow.some(
    (entry) => entry.includes('/caprock/') && entry.includes('status.sh'),
  );
  if (hasEntry) {
    ok('status.sh allow entry registered in ~/.claude/settings.json');
    return true;
  }
  fail('status.sh allow entry not found in ~/.claude/settings.json');
  info(
    'It is registered automatically at SessionStart — open a new session to trigger it.',
  );
  return false;
}

/**
 * Run all setup checks and print results.
 */
async function main(): Promise<void> {
  console.log(`caprock v${await readVersion()} — setup check`);
  console.log(`Plugin root: ${PLUGIN_ROOT}`);
  console.log();

  const tsOk = await checkTreeSitter();
  const daemonOk = await checkDaemon();
  const allowOk = await checkAllowEntry();

  console.log();
  const allOk = tsOk && daemonOk && allowOk;
  if (allOk) {
    console.log('All checks passed — caprock is ready.');
  } else {
    console.log(
      'Some checks failed. Address the items above, then run /caprock:setup again.',
    );
    if (!tsOk) {
      console.log();
      console.log('To rebuild tree-sitter manually:');
      console.log(
        `  cd ${PLUGIN_ROOT} && npm rebuild tree-sitter tree-sitter-bash`,
      );
    }
  }
}

main().catch((error) => {
  process.stderr.write(`[caprock:setup] ${String(error)}\n`);
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
});
