import type { AnyHookPayload } from '../types.ts';
import { onFileChanged } from './file-changed.ts';
import { onPermissionDenied } from './permission-denied.ts';
import { onPermissionRequest } from './permission-request.ts';
import { onPostToolUse } from './post-tool-use.ts';
import { onPreToolUse } from './pre-tool-use.ts';
import { onSessionEnd } from './session-end.ts';
import { onSessionStart } from './session-start.ts';
import type { HookDeps } from './types.ts';

/**
 * Route a parsed hook payload to the appropriate handler. Unknown event names
 * are silently ignored — Claude Code may add new events over time, and the
 * plugin should remain forward-compatible.
 *
 * @param payload - The parsed hook payload from stdin.
 * @param deps - Hook dependencies.
 */
export async function dispatch(
  payload: AnyHookPayload,
  deps: HookDeps,
): Promise<void> {
  switch (payload.hook_event_name) {
    case 'SessionStart':
      await onSessionStart(payload, deps);
      break;
    case 'PreToolUse':
      await onPreToolUse(payload, deps);
      break;
    case 'PostToolUse':
      await onPostToolUse(payload, deps);
      break;
    case 'PermissionRequest':
      await onPermissionRequest(payload, deps);
      break;
    case 'PermissionDenied':
      await onPermissionDenied(payload, deps);
      break;
    case 'FileChanged':
      await onFileChanged(payload, deps);
      break;
    case 'SessionEnd':
      await onSessionEnd(payload, deps);
      break;
    default:
      break;
  }
}
