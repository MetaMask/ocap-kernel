import type { SessionState } from '../types.ts';
import type { HookDeps } from './types.ts';

/**
 * Collect the current union of all watched settings permission lists. The
 * snapshot is captured at session start and again by {@link initFreshSession}
 * when a hook fires before SessionStart has run.
 *
 * @param deps - Hook dependencies (only `store` and `settingsPaths` used).
 * @returns Deduplicated allow and deny entry lists.
 */
export async function collectSettingsSnapshot(
  deps: Pick<HookDeps, 'store' | 'settingsPaths'>,
): Promise<{ allow: string[]; deny: string[] }> {
  const [allowLists, denyLists] = await Promise.all([
    Promise.all(
      deps.settingsPaths.map(async (path) =>
        deps.store.readSettingsAllowList(path),
      ),
    ),
    Promise.all(
      deps.settingsPaths.map(async (path) =>
        deps.store.readSettingsDenyList(path),
      ),
    ),
  ]);
  return {
    allow: [...new Set(allowLists.flat())],
    deny: [...new Set(denyLists.flat())],
  };
}

/**
 * Boot a brand-new session: ensure the daemon, take a settings snapshot,
 * launch the permission vat, create a kernel session, and persist state.
 *
 * Returns `null` if the daemon is unavailable — callers should fall back to a
 * passthrough decision (the user's setup is broken, so we should not block).
 *
 * @param sessionId - The Claude Code session ID.
 * @param deps - Hook dependencies.
 * @returns The newly created session state, or `null` if the daemon is down.
 */
export async function initFreshSession(
  sessionId: string,
  deps: HookDeps,
): Promise<SessionState | null> {
  await deps.ensureDaemon();
  if (!(await deps.rpc.pingDaemon(deps.socketPath))) {
    return null;
  }

  const [snapshot, vat, kernel] = await Promise.all([
    collectSettingsSnapshot(deps),
    deps.rpc.launchPermissionVat(deps.socketPath, deps.vatBundlePath),
    deps.rpc.createKernelSession(deps.socketPath, sessionId),
  ]);

  const state: SessionState = {
    sessionId,
    kernelSessionId: kernel.sessionId,
    ocapUrl: kernel.ocapUrl,
    rootKref: vat.rootKref,
    subclusterId: vat.subclusterId,
    startedAt: deps.now(),
    settingsSnapshot: snapshot.allow,
    settingsDenySnapshot: snapshot.deny,
  };
  await deps.store.saveSessionState(sessionId, state);
  return state;
}

/**
 * Load the session state for a Claude Code session, creating it on demand if
 * the hook fires before SessionStart has run (e.g. the plugin was installed
 * mid-session). If an existing state is missing a `kernelSessionId` (older
 * format), attempt to attach a fresh kernel session before returning.
 *
 * @param sessionId - The Claude Code session ID.
 * @param deps - Hook dependencies.
 * @returns The session state, or `null` if no session exists and the daemon is unavailable.
 */
export async function getOrInitSession(
  sessionId: string,
  deps: HookDeps,
): Promise<SessionState | null> {
  const existing = await deps.store.loadSessionState(sessionId);
  if (existing) {
    if (typeof existing.kernelSessionId !== 'string') {
      await deps.ensureDaemon();
      if (!(await deps.rpc.pingDaemon(deps.socketPath))) {
        return existing;
      }
      const kernel = await deps.rpc.createKernelSession(
        deps.socketPath,
        sessionId,
      );
      existing.kernelSessionId = kernel.sessionId;
      existing.ocapUrl = kernel.ocapUrl;
      await deps.store.saveSessionState(sessionId, existing);
    }
    return existing;
  }
  return initFreshSession(sessionId, deps);
}
