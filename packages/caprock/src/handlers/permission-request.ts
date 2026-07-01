/* eslint-disable camelcase */
import { buildClauses, inputSha, routeAllClauses } from '../clauses.ts';
import type { PermissionRequestPayload } from '../types.ts';
import { permissionAllow } from './output.ts';
import type { HookDeps } from './types.ts';
import { checkHookVersionTransition } from './version.ts';

/**
 * Handle the PermissionRequest hook event.
 *
 * If the permission vat already covers the request, emit the `allow` decision
 * directly so Claude Code skips its native prompt. Otherwise stay silent and
 * defer to the native flow (which will in turn trigger PreToolUse).
 *
 * @param payload - The PermissionRequest hook payload.
 * @param deps - Hook dependencies.
 */
export async function onPermissionRequest(
  payload: PermissionRequestPayload,
  deps: HookDeps,
): Promise<void> {
  const { session_id, tool_name, tool_input } = payload;
  const sha = tool_input ? inputSha(tool_input) : null;

  await deps.store.appendEvent(session_id, {
    t: deps.now(),
    event: 'prompted',
    sessionId: session_id,
    toolName: tool_name ?? null,
    inputSha: sha,
  });

  const loaded = await deps.store.loadSessionState(session_id);
  if (!loaded?.kernelSessionId) {
    return;
  }
  const state = await checkHookVersionTransition(session_id, loaded, deps);

  if (!tool_name || !tool_input) {
    return;
  }

  const clauses = buildClauses(tool_name, tool_input);
  if (clauses === null) {
    return;
  }

  try {
    const verdict = await routeAllClauses({
      rpc: deps.rpc,
      socketPath: deps.socketPath,
      rootKref: state.rootKref,
      tool: tool_name,
      clauses,
    });
    if (verdict === 'allow') {
      deps.stdout(`${permissionAllow()}\n`);
    }
  } catch {
    /* vat error — defer to Claude Code native dialog */
  }
}
