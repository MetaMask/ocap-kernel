/* eslint-disable camelcase */
import type { FileChangedPayload } from '../types.ts';
import type { HookDeps } from './types.ts';

/**
 * Handle the FileChanged hook event: detect newly added allow-list entries in
 * the watched settings file and append a `rule_grant` event for each, then
 * persist the updated snapshot.
 *
 * Delete events and non-allowlist mutations are ignored — the audit cares
 * about *new* user authority, not arbitrary file edits.
 *
 * @param payload - The FileChanged hook payload.
 * @param deps - Hook dependencies.
 */
export async function onFileChanged(
  payload: FileChangedPayload,
  deps: HookDeps,
): Promise<void> {
  const { session_id, file_path, change_type } = payload;
  if (change_type === 'delete') {
    return;
  }

  const state = await deps.store.loadSessionState(session_id);
  if (!state) {
    return;
  }

  const current = await deps.store.readSettingsAllowList(file_path);
  const prev = new Set(state.settingsSnapshot);
  const newEntries = current.filter((entry) => !prev.has(entry));

  for (const pattern of newEntries) {
    await deps.store.appendEvent(session_id, {
      t: deps.now(),
      event: 'rule_grant',
      sessionId: session_id,
      pattern,
      filePath: file_path,
    });
  }

  if (newEntries.length > 0) {
    state.settingsSnapshot = [
      ...new Set([...state.settingsSnapshot, ...current]),
    ];
    await deps.store.saveSessionState(session_id, state);
  }
}
