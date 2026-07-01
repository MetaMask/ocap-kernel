import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { getCaprockDir } from './paths/ocap-kernel.ts';
import type { SessionState, CaprockEvent } from './types.ts';

/** Create the caprock state directory if it does not exist. */
async function ensureCaprockDir(): Promise<void> {
  await mkdir(getCaprockDir(), { recursive: true });
}

/**
 * Absolute path to the JSON state file for a session.
 *
 * @param sessionId - The Claude Code session ID.
 * @returns Absolute path to the `.json` state file.
 */
function statePath(sessionId: string): string {
  return join(getCaprockDir(), `${sessionId}.json`);
}

/**
 * Absolute path to the JSONL event log for a session.
 *
 * @param sessionId - The Claude Code session ID.
 * @returns Absolute path to the `.jsonl` event log.
 */
function eventLogPath(sessionId: string): string {
  return join(getCaprockDir(), `${sessionId}.jsonl`);
}

/**
 * Load the persisted session state for a Claude Code session.
 *
 * @param sessionId - The Claude Code session ID.
 * @returns The session state, or null if none exists.
 */
export async function loadSessionState(
  sessionId: string,
): Promise<SessionState | null> {
  try {
    return JSON.parse(
      await readFile(statePath(sessionId), 'utf8'),
    ) as SessionState;
  } catch {
    return null;
  }
}

/**
 * Persist the session state for a Claude Code session.
 *
 * @param sessionId - The Claude Code session ID.
 * @param state - The session state to save.
 */
export async function saveSessionState(
  sessionId: string,
  state: SessionState,
): Promise<void> {
  await ensureCaprockDir();
  await writeFile(statePath(sessionId), JSON.stringify(state, null, 2));
}

/**
 * Append an event to the session event log.
 *
 * @param sessionId - The Claude Code session ID.
 * @param event - The event to record.
 */
export async function appendEvent(
  sessionId: string,
  event: CaprockEvent,
): Promise<void> {
  await ensureCaprockDir();
  await appendFile(eventLogPath(sessionId), `${JSON.stringify(event)}\n`);
}

/**
 * Read all events from the session event log.
 *
 * @param sessionId - The Claude Code session ID.
 * @returns The list of recorded events, or an empty array if none exist.
 */
export async function readEvents(sessionId: string): Promise<CaprockEvent[]> {
  let raw: string;
  try {
    raw = await readFile(eventLogPath(sessionId), 'utf8');
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CaprockEvent);
}

/**
 * Read the permissions.allow list from a Claude Code settings file.
 *
 * @param settingsPath - Absolute path to the settings JSON file.
 * @returns The allow list, or an empty array if the file is absent or unreadable.
 */
export async function readSettingsAllowList(
  settingsPath: string,
): Promise<string[]> {
  try {
    const raw = JSON.parse(await readFile(settingsPath, 'utf8')) as {
      permissions?: { allow?: string[] };
    };
    return raw.permissions?.allow ?? [];
  } catch {
    return [];
  }
}

/**
 * Read the permissions.deny list from a Claude Code settings file.
 *
 * @param settingsPath - Absolute path to the settings JSON file.
 * @returns The deny list, or an empty array if the file is absent or unreadable.
 */
export async function readSettingsDenyList(
  settingsPath: string,
): Promise<string[]> {
  try {
    const raw = JSON.parse(await readFile(settingsPath, 'utf8')) as {
      permissions?: { deny?: string[] };
    };
    return raw.permissions?.deny ?? [];
  } catch {
    return [];
  }
}

/**
 * Derive the colocated caprock output path from the session transcript path.
 * e.g. `~/.claude/projects/.../<uuid>.jsonl` → `<uuid>.caprock.jsonl`
 *
 * @param transcriptPath - The path to the Claude Code transcript file.
 * @returns The derived caprock output path.
 */
export function caprockOutputPath(transcriptPath: string): string {
  if (transcriptPath.endsWith('.jsonl')) {
    return `${transcriptPath.slice(0, -6)}.caprock.jsonl`;
  }
  return `${transcriptPath}.caprock.jsonl`;
}
