/**
 * Test factories for the {@link HookDeps} bag.
 *
 * Each factory returns a fully-typed object whose RPC and storage methods are
 * `vi.fn()` mocks pre-stubbed with sensible defaults. Tests override individual
 * mocks as needed via `mockResolvedValueOnce` / `mockImplementationOnce`.
 *
 * The factories never read from the real filesystem or network — every
 * dependency is fake so handler tests run in milliseconds and never spawn
 * processes.
 */

import type { Provision } from '@metamask/kernel-utils/session/provision';
import { vi } from 'vitest';

import type { HookDeps, SessionStore } from '../src/handlers/types.ts';
import type { RpcClient } from '../src/rpc.ts';
import type { CaprockEvent, Decision, SessionState } from '../src/types.ts';

/**
 * Build a {@link SessionState} for a test, filling unset fields with
 * deterministic defaults.
 *
 * @param overrides - Specific fields to set; the rest are filled in.
 * @returns A complete session state suitable for the store fake.
 */
export function makeSessionState(
  overrides: Partial<SessionState> = {},
): SessionState {
  return {
    sessionId: 'test-session',
    kernelSessionId: 'kernel-test-session',
    ocapUrl: 'ocap://test',
    rootKref: 'ko1',
    subclusterId: 'sub-1',
    startedAt: '2026-01-01T00:00:00.000Z',
    settingsSnapshot: [],
    settingsDenySnapshot: [],
    ...overrides,
  };
}

/**
 * Build a TUI {@link Decision} for a test.
 *
 * @param overrides - Specific fields to set.
 * @returns A complete decision suitable for `authorizeRequest` mocks.
 */
export function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    token: 'token-1',
    verdict: 'accept',
    feedback: '',
    ...overrides,
  };
}

/**
 * Build a fake {@link RpcClient} whose methods are pre-stubbed `vi.fn()`s.
 *
 * Defaults: `pingDaemon → true`, `vatRoute → 'allow'`, all `vat*` mutators
 * resolve to undefined, `vatSize → 0`, `vatFindMatch → null`,
 * `listVatProvisions → []`, `authorizeRequest → makeDecision()`,
 * `createKernelSession → { sessionId, ocapUrl }`,
 * `launchPermissionVat → { rootKref, subclusterId }`.
 *
 * @returns A fake RpcClient.
 */
export function makeFakeRpcClient(): RpcClient {
  return {
    pingDaemon: vi.fn(async () => true),
    createKernelSession: vi.fn(async () => ({
      sessionId: 'kernel-test-session',
      ocapUrl: 'ocap://test',
    })),
    authorizeRequest: vi.fn(async () => makeDecision()),
    recordProvisioned: vi.fn(async () => undefined),
    launchPermissionVat: vi.fn(async () => ({
      rootKref: 'ko1',
      subclusterId: 'sub-1',
    })),
    vatRoute: vi.fn(async () => 'allow' as const),
    vatAddSection: vi.fn(async () => undefined),
    vatFindMatch: vi.fn(async () => null as Provision | null),
    vatSize: vi.fn(async () => 0),
    listVatProvisions: vi.fn(async () => [] as Provision[]),
  };
}

/**
 * Build a fake {@link SessionStore} backed by in-memory maps. Reading
 * `events` after a handler runs exposes the appended events for assertions.
 *
 * @param seed - Initial state and events to preload, keyed by session ID.
 * @param seed.states - Initial session states keyed by session ID.
 * @param seed.events - Initial event log entries keyed by session ID.
 * @param seed.allowLists - Settings allow-list entries keyed by settings file path.
 * @param seed.denyLists - Settings deny-list entries keyed by settings file path.
 * @returns The fake plus its underlying maps (so tests can inspect them).
 */
export function makeFakeStore(
  seed: {
    states?: Record<string, SessionState>;
    events?: Record<string, CaprockEvent[]>;
    allowLists?: Record<string, string[]>;
    denyLists?: Record<string, string[]>;
  } = {},
): SessionStore & {
  states: Map<string, SessionState>;
  events: Map<string, CaprockEvent[]>;
  allowLists: Map<string, string[]>;
  denyLists: Map<string, string[]>;
} {
  const states = new Map<string, SessionState>(
    Object.entries(seed.states ?? {}),
  );
  const events = new Map<string, CaprockEvent[]>(
    Object.entries(seed.events ?? {}),
  );
  const allowLists = new Map<string, string[]>(
    Object.entries(seed.allowLists ?? {}),
  );
  const denyLists = new Map<string, string[]>(
    Object.entries(seed.denyLists ?? {}),
  );

  return {
    states,
    events,
    allowLists,
    denyLists,
    loadSessionState: vi.fn(async (id) => states.get(id) ?? null),
    saveSessionState: vi.fn(async (id, state) => {
      states.set(id, { ...state });
    }),
    appendEvent: vi.fn(async (id, event) => {
      const list = events.get(id) ?? [];
      list.push(event);
      events.set(id, list);
    }),
    readEvents: vi.fn(async (id) => events.get(id) ?? []),
    readSettingsAllowList: vi.fn(async (path) => allowLists.get(path) ?? []),
    readSettingsDenyList: vi.fn(async (path) => denyLists.get(path) ?? []),
  };
}

/**
 * Build a complete {@link HookDeps} for a test, with an RPC client and store
 * pre-stubbed by {@link makeFakeRpcClient} / {@link makeFakeStore}. The
 * returned bag also exposes captured stdout/stderr writes as arrays so
 * assertions can inspect what the handler emitted.
 *
 * @param overrides - Specific deps to swap in (e.g. a pre-seeded store).
 * @returns A complete HookDeps plus capture arrays.
 */
export function makeFakeDeps(overrides: Partial<HookDeps> = {}): HookDeps & {
  stdoutLines: string[];
  stderrLines: string[];
} {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const base: HookDeps = {
    rpc: makeFakeRpcClient(),
    store: makeFakeStore(),
    now: () => '2026-01-01T00:00:00.000Z',
    stdout: (chunk) => stdoutLines.push(chunk),
    stderr: (chunk) => stderrLines.push(chunk),
    socketPath: '/tmp/test.sock',
    vatBundlePath: '/tmp/permission-tracker.bundle',
    settingsPaths: ['/tmp/settings.json'],
    ensureDaemon: vi.fn(async () => undefined),
    registerSkillPermissions: vi.fn(async () => undefined),
    writeConnectFile: vi.fn(async () => undefined),
    caprockJsonlPath: (id) => `/tmp/caprock/${id}.jsonl`,
  };
  return { ...base, ...overrides, stdoutLines, stderrLines };
}
