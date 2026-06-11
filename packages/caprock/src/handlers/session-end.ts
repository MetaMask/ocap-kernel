/* eslint-disable camelcase */
import { writeFile } from 'node:fs/promises';

import { caprockOutputPath } from '../session.ts';
import type { SessionEndPayload } from '../types.ts';
import type { HookDeps } from './types.ts';

/**
 * Handle the SessionEnd hook event: append a final `session_end` event, then
 * write the complete event log to the colocated `.caprock.jsonl` file next to
 * the Claude Code transcript.
 *
 * The allow-count is read from the live vat when possible (authoritative);
 * otherwise it falls back to counting `grant` events recorded during the
 * session.
 *
 * @param payload - The SessionEnd hook payload.
 * @param deps - Hook dependencies.
 */
export async function onSessionEnd(
  payload: SessionEndPayload,
  deps: HookDeps,
): Promise<void> {
  const { session_id, transcript_path } = payload;

  const state = await deps.store.loadSessionState(session_id);
  let allowCount = 0;
  if (state) {
    try {
      allowCount = await deps.rpc.vatSize(deps.socketPath, state.rootKref);
    } catch {
      const events = await deps.store.readEvents(session_id);
      allowCount = events.filter((event) => event.event === 'grant').length;
    }
  }

  await deps.store.appendEvent(session_id, {
    t: deps.now(),
    event: 'session_end',
    sessionId: session_id,
    allowCount,
  });

  const events = await deps.store.readEvents(session_id);
  const outputPath = caprockOutputPath(transcript_path);
  await writeFile(
    outputPath,
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
  );
  deps.stderr(`[caprock] Session trace → ${outputPath}\n`);
}
