import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onSessionEnd } from './session-end.ts';
import {
  makeFakeDeps,
  makeFakeStore,
  makeSessionState,
} from '../../test/handler-fakes.ts';

describe('onSessionEnd', () => {
  let tmpDir: string;
  let transcriptPath: string;
  let outputPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'caprock-session-end-test-'));
    transcriptPath = join(tmpDir, 'transcript.jsonl');
    outputPath = join(tmpDir, 'transcript.caprock.jsonl');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes the event log and uses vatSize for the allow count', async () => {
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: { 'test-session': makeSessionState() },
        events: {
          'test-session': [
            { t: '0', event: 'grant', sessionId: 'test-session' },
          ],
        },
      }),
    });
    (deps.rpc.vatSize as ReturnType<typeof vi.fn>).mockResolvedValue(7);

    await onSessionEnd(
      {
        hook_event_name: 'SessionEnd',
        session_id: 'test-session',
        transcript_path: transcriptPath,
      },
      deps,
    );

    const content = await readFile(outputPath, 'utf8');
    const events = content
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const endEvent = events.find((event) => event.event === 'session_end');
    expect(endEvent).toMatchObject({
      event: 'session_end',
      allowCount: 7,
    });
  });

  it('falls back to counting grant events when vatSize fails', async () => {
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: { 'test-session': makeSessionState() },
        events: {
          'test-session': [
            { t: '0', event: 'grant', sessionId: 'test-session' },
            { t: '1', event: 'grant', sessionId: 'test-session' },
            { t: '2', event: 'check', sessionId: 'test-session' },
          ],
        },
      }),
    });
    (deps.rpc.vatSize as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom'),
    );

    await onSessionEnd(
      {
        hook_event_name: 'SessionEnd',
        session_id: 'test-session',
        transcript_path: transcriptPath,
      },
      deps,
    );

    const content = await readFile(outputPath, 'utf8');
    const events = content
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({
      event: 'session_end',
      allowCount: 2,
    });
  });
});
