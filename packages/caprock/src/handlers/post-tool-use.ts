/* eslint-disable camelcase */
import { invocationToProvision } from '@metamask/kernel-utils/session/provision';

import { buildClauses, inputSha } from '../clauses.ts';
import type { PostToolUsePayload } from '../types.ts';
import type { HookDeps } from './types.ts';
import { checkHookVersionTransition } from './version.ts';

/**
 * Handle the PostToolUse hook event: register each clause of the just-executed
 * tool call as a section in the permission sheaf, so an identical follow-up
 * call short-circuits the TUI prompt.
 *
 * @param payload - The PostToolUse hook payload.
 * @param deps - Hook dependencies.
 */
export async function onPostToolUse(
  payload: PostToolUsePayload,
  deps: HookDeps,
): Promise<void> {
  const { session_id, tool_name, tool_input } = payload;
  const sha = inputSha(tool_input);

  const loaded = await deps.store.loadSessionState(session_id);
  if (!loaded) {
    return;
  }
  const state = await checkHookVersionTransition(session_id, loaded, deps);

  const clauses = buildClauses(tool_name, tool_input);
  if (clauses !== null) {
    try {
      for (const clause of clauses) {
        await deps.rpc.vatAddSection(
          deps.socketPath,
          state.rootKref,
          invocationToProvision(tool_name, clause),
        );
      }
    } catch (error) {
      deps.stderr(`[caprock] vatAddSection failed: ${String(error)}\n`);
    }
  }

  await deps.store.appendEvent(session_id, {
    t: deps.now(),
    event: 'grant',
    sessionId: session_id,
    toolName: tool_name,
    inputSha: sha,
    grantType: 'invocation',
  });
}
