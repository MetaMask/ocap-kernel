/* eslint-disable camelcase */
import type { SessionStartPayload } from '../types.ts';
import { initFreshSession } from './init.ts';
import type { HookDeps } from './types.ts';

/**
 * Handle the SessionStart hook event.
 *
 * Side effects:
 * - Idempotently install the helper-script allow rules in `~/.claude/settings.json`.
 * - Ensure the daemon is running, then take a settings snapshot, launch the
 *   permission vat, create a kernel session, and persist the resulting state.
 * - Append a `session_start` event to the per-session log.
 * - Write the connect-hint file and a stdout greeting telling the user how to
 *   attach the TUI.
 *
 * If the daemon cannot be reached, write a single passthrough notice to stdout
 * and skip the rest — authority tracking is inactive for this session but
 * Claude Code still functions normally.
 *
 * @param payload - The SessionStart hook payload.
 * @param deps - Hook dependencies.
 */
export async function onSessionStart(
  payload: SessionStartPayload,
  deps: HookDeps,
): Promise<void> {
  const { session_id, transcript_path } = payload;

  await deps
    .registerSkillPermissions()
    .catch((error) =>
      deps.stderr(`[caprock] registerSkillPermissions: ${String(error)}\n`),
    );

  const state = await initFreshSession(session_id, deps);
  if (!state) {
    deps.stderr('[caprock] Daemon not available, skipping init\n');
    deps.stdout(
      `${JSON.stringify({ output: '[caprock] daemon unavailable — authority tracking inactive' })}\n`,
    );
    return;
  }

  await deps.store.appendEvent(session_id, {
    t: deps.now(),
    event: 'session_start',
    sessionId: session_id,
    kernelSessionId: state.kernelSessionId,
    rootKref: state.rootKref,
    transcriptPath: transcript_path,
    settingsAllowCount: state.settingsSnapshot.length,
    hookVersion: deps.hookVersion,
    vatVersion: state.vatVersion,
  });

  const connectCmd = `ocap modal ${state.kernelSessionId}`;
  await deps.writeConnectFile(connectCmd);
  deps.stderr(`[caprock] TUI: ${connectCmd}\n`);

  const caprockFile = deps.caprockJsonlPath(session_id);
  deps.stdout(
    `${JSON.stringify({
      output:
        `[caprock] tracking authority → ${caprockFile} (${state.settingsSnapshot.length} rules in allowlist)\n` +
        `[caprock] TUI: run \`ocap tui\` (session appears automatically) or \`${connectCmd}\` to connect directly`,
    })}\n`,
  );
}
