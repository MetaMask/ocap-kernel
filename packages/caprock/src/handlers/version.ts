import type { HookVersionRecord, SessionState } from '../types.ts';
import type { HookDeps } from './types.ts';

/**
 * Compare two dotted version strings (e.g. `'0.1.0'`, `'0.10.2'`) numerically
 * by segment. Non-numeric segments compare as `NaN` and are coerced to `0` so
 * a malformed input never throws — version-up detection is best-effort.
 *
 * @param left - Left version.
 * @param right - Right version.
 * @returns `-1` if `left < right`, `0` if equal, `1` if `left > right`.
 */
export function compareSemver(left: string, right: string): -1 | 0 | 1 {
  const leftParts = left.split('.').map((seg) => Number.parseInt(seg, 10) || 0);
  const rightParts = right
    .split('.')
    .map((seg) => Number.parseInt(seg, 10) || 0);
  const len = Math.max(leftParts.length, rightParts.length);
  for (let idx = 0; idx < len; idx++) {
    const leftPart = leftParts[idx] ?? 0;
    const rightPart = rightParts[idx] ?? 0;
    if (leftPart < rightPart) {
      return -1;
    }
    if (leftPart > rightPart) {
      return 1;
    }
  }
  return 0;
}

/**
 * Detect a hook-binary version transition for an existing session.
 *
 * On every hook invocation that loads session state, this is called with the
 * loaded state and the current `deps.hookVersion`. If the latest recorded
 * version differs from the current one:
 *  - higher → append a new {@link HookVersionRecord}, emit a `version_up`
 *    event, persist the state, and return the updated state.
 *  - lower  → throw, because versions are assumed monotonically non-decreasing
 *    (a downgrade in the middle of a session implies a misconfigured install).
 *
 * Sessions whose state predates the version-tracking feature have no
 * `hookVersionHistory` field; for those we skip detection rather than
 * back-fill — a missing record means "we don't know."
 *
 * @param sessionId - The Claude Code session ID.
 * @param state - The loaded session state.
 * @param deps - Hook dependencies.
 * @returns The (possibly updated) session state.
 */
export async function checkHookVersionTransition(
  sessionId: string,
  state: SessionState,
  deps: HookDeps,
): Promise<SessionState> {
  const history = state.hookVersionHistory;
  if (history === undefined || history.length === 0) {
    return state;
  }
  const last = history[history.length - 1] as HookVersionRecord;
  if (last.version === deps.hookVersion) {
    return state;
  }
  const order = compareSemver(deps.hookVersion, last.version);
  if (order < 0) {
    throw new Error(
      `[caprock] hook version regressed for session ${sessionId}: ` +
        `${last.version} → ${deps.hookVersion} (versions must be monotonically non-decreasing)`,
    );
  }
  const recordedAt = deps.now();
  const next: SessionState = {
    ...state,
    hookVersionHistory: [...history, { version: deps.hookVersion, recordedAt }],
  };
  await deps.store.appendEvent(sessionId, {
    t: recordedAt,
    event: 'version_up',
    sessionId,
    prevHookVersion: last.version,
    newHookVersion: deps.hookVersion,
  });
  await deps.store.saveSessionState(sessionId, next);
  return next;
}
