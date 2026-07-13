/* eslint-disable camelcase */
import { inputSha } from '../clauses.ts';
import type { PermissionDeniedPayload } from '../types.ts';
import type { HookDeps } from './types.ts';

/**
 * Handle the PermissionDenied hook event: append a `denied` event to the
 * session log. No side effects on the vat — Claude Code already denied.
 *
 * @param payload - The PermissionDenied hook payload.
 * @param deps - Hook dependencies.
 */
export async function onPermissionDenied(
  payload: PermissionDeniedPayload,
  deps: HookDeps,
): Promise<void> {
  const { session_id, tool_name, tool_input } = payload;
  await deps.store.appendEvent(session_id, {
    t: deps.now(),
    event: 'denied',
    sessionId: session_id,
    toolName: tool_name ?? null,
    inputSha: tool_input ? inputSha(tool_input) : null,
  });
}
