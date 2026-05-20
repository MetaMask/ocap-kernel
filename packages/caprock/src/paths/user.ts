import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Absolute path to the `~/.claude` directory.
 *
 * @returns The Claude Code home directory.
 */
export function getClaudeDir(): string {
  return join(homedir(), '.claude');
}

/**
 * Absolute path to `~/.claude/projects/`.
 *
 * @returns The directory containing per-project transcript files.
 */
export function getClaudeProjectsDir(): string {
  return join(getClaudeDir(), 'projects');
}

/**
 * Absolute path to `~/.claude/settings.json`.
 *
 * @returns The global Claude Code settings file path.
 */
export function getClaudeSettingsPath(): string {
  return join(getClaudeDir(), 'settings.json');
}
