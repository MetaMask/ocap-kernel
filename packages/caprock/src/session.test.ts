import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CaprockEvent, SessionState } from './types.ts';

const mockDir = vi.hoisted(() => ({ value: '' }));

vi.mock('./paths/ocap-kernel.ts', () => ({
  getCaprockDir: () => mockDir.value,
}));

// Imported after vi.mock so the mock is in place at module load time.
const {
  loadSessionState,
  saveSessionState,
  appendEvent,
  readEvents,
  readSettingsAllowList,
} = await import('./session.ts');

const SESSION_ID = 'test-session-abc123';

const makeState = (): SessionState => ({
  sessionId: SESSION_ID,
  kernelSessionId: 'kernel-sess-xyz',
  ocapUrl: 'ocap://localhost/xyz',
  rootKref: 'ko42',
  subclusterId: 'sub-1',
  startedAt: '2026-01-01T00:00:00.000Z',
  settingsSnapshot: ['Bash(ls)', 'Read(**/*)', 'Write(**/*.ts)'],
});

const makeEvent = (extra: Record<string, unknown> = {}): CaprockEvent => ({
  t: '2026-01-01T00:01:00.000Z',
  event: 'grant',
  sessionId: SESSION_ID,
  toolName: 'Bash',
  ...extra,
});

describe('session state persistence', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'caprock-test-'));
    mockDir.value = tmpDir;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null for a session that has never been saved', async () => {
    expect(await loadSessionState('no-such-session')).toBeNull();
  });

  it('round-trips a session state through save and load', async () => {
    const state = makeState();
    await saveSessionState(SESSION_ID, state);
    expect(await loadSessionState(SESSION_ID)).toStrictEqual(state);
  });

  it('overwrites a previously saved state on re-save', async () => {
    const original = makeState();
    await saveSessionState(SESSION_ID, original);

    const updated = { ...original, kernelSessionId: 'kernel-sess-updated' };
    await saveSessionState(SESSION_ID, updated);

    expect(await loadSessionState(SESSION_ID)).toStrictEqual(updated);
  });

  it('creates the caprock directory if it does not exist', async () => {
    const deepDir = join(tmpDir, 'nested', 'caprock');
    mockDir.value = deepDir;

    await saveSessionState(SESSION_ID, makeState());
    expect(await loadSessionState(SESSION_ID)).not.toBeNull();
  });
});

describe('event log', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'caprock-test-'));
    mockDir.value = tmpDir;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty array when no log exists', async () => {
    expect(await readEvents('no-such-session')).toStrictEqual([]);
  });

  it('round-trips a single event through append and read', async () => {
    const event = makeEvent();
    await appendEvent(SESSION_ID, event);
    expect(await readEvents(SESSION_ID)).toStrictEqual([event]);
  });

  it('preserves event order across multiple appends', async () => {
    // Omit toolName entirely on session_start — JSON.stringify drops undefined
    // values, so toStrictEqual would fail if the key is present with undefined.
    const first: CaprockEvent = {
      t: '2026-01-01T00:01:00.000Z',
      event: 'session_start',
      sessionId: SESSION_ID,
    };
    const second = makeEvent({ event: 'grant', toolName: 'Bash' });
    const third = makeEvent({ event: 'prompted', toolName: 'Write' });

    await appendEvent(SESSION_ID, first);
    await appendEvent(SESSION_ID, second);
    await appendEvent(SESSION_ID, third);

    expect(await readEvents(SESSION_ID)).toStrictEqual([first, second, third]);
  });

  it('ignores blank lines in the event log', async () => {
    const logPath = join(tmpDir, `${SESSION_ID}.jsonl`);
    const event = makeEvent();
    await writeFile(
      logPath,
      `${JSON.stringify(event)}\n\n  \n${JSON.stringify(event)}\n`,
    );
    expect(await readEvents(SESSION_ID)).toStrictEqual([event, event]);
  });
});

describe('readSettingsAllowList', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'caprock-settings-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty array for a missing file', async () => {
    expect(
      await readSettingsAllowList(join(tmpDir, 'nonexistent.json')),
    ).toStrictEqual([]);
  });

  it('returns an empty array for a file with no permissions key', async () => {
    const path = join(tmpDir, 'settings.json');
    await writeFile(path, JSON.stringify({ theme: 'dark' }));
    expect(await readSettingsAllowList(path)).toStrictEqual([]);
  });

  it('returns an empty array for a file with no allow list', async () => {
    const path = join(tmpDir, 'settings.json');
    await writeFile(path, JSON.stringify({ permissions: {} }));
    expect(await readSettingsAllowList(path)).toStrictEqual([]);
  });

  it('returns the allow list when present', async () => {
    const allow = ['Bash(ls)', 'Read(**/*.ts)'];
    const path = join(tmpDir, 'settings.json');
    await writeFile(path, JSON.stringify({ permissions: { allow } }));
    expect(await readSettingsAllowList(path)).toStrictEqual(allow);
  });

  it('returns an empty array for a malformed JSON file', async () => {
    const path = join(tmpDir, 'settings.json');
    await writeFile(path, 'not json {{{');
    expect(await readSettingsAllowList(path)).toStrictEqual([]);
  });
});
