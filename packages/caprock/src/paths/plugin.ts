/* eslint-disable n/no-process-env */
import { join } from 'node:path';

/**
 * The plugin root directory: `CLAUDE_PLUGIN_ROOT` env var, or parent of the bin dir.
 *
 * @param pluginBinDir - The directory containing the running bin script.
 * @returns Absolute path to the plugin root.
 */
export function getPluginRoot(pluginBinDir: string): string {
  return process.env.CLAUDE_PLUGIN_ROOT ?? join(pluginBinDir, '..');
}

/**
 * The plugin data directory (npm install cache etc.): `CLAUDE_PLUGIN_DATA` or plugin root.
 *
 * @param pluginBinDir - The directory containing the running bin script.
 * @returns Absolute path to the plugin data directory.
 */
export function getPluginDataDir(pluginBinDir: string): string {
  return process.env.CLAUDE_PLUGIN_DATA ?? getPluginRoot(pluginBinDir);
}

/**
 * The project directory (workspace root): `CLAUDE_PROJECT_DIR` or plugin root.
 *
 * @param pluginBinDir - The directory containing the running bin script.
 * @returns Absolute path to the project directory.
 */
export function getProjectDir(pluginBinDir: string): string {
  return process.env.CLAUDE_PROJECT_DIR ?? getPluginRoot(pluginBinDir);
}

/**
 * Absolute path to the compiled permission-tracker vat bundle.
 *
 * @param pluginBinDir - The directory containing the running bin script.
 * @returns Absolute path to `vat/permission-tracker.bundle`.
 */
export function getVatBundlePath(pluginBinDir: string): string {
  return join(getPluginRoot(pluginBinDir), 'vat', 'permission-tracker.bundle');
}

/**
 * Project-local settings file watched for FileChanged rule grants.
 *
 * @param pluginBinDir - The directory containing the running bin script.
 * @returns Absolute path to `.claude/settings.local.json` in the project dir.
 */
export function getProjectSettingsLocalPath(pluginBinDir: string): string {
  return join(getProjectDir(pluginBinDir), '.claude', 'settings.local.json');
}

/**
 * Path to the plugin manifest (`plugin.json`), which carries the canonical version.
 *
 * @param pluginBinDir - The directory containing the running bin script.
 * @returns Absolute path to `.claude-plugin/plugin.json`.
 */
export function getPluginManifestPath(pluginBinDir: string): string {
  return join(getPluginRoot(pluginBinDir), '.claude-plugin', 'plugin.json');
}
