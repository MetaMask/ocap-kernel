import { describe, expect, it, vi } from 'vitest';

import { onPreToolUse } from './pre-tool-use.ts';
import {
  makeDecision,
  makeFakeDeps,
  makeFakeStore,
  makeSessionState,
} from '../../test/handler-fakes.ts';
import type { PreToolUsePayload } from '../types.ts';

/**
 * Build a representative PreToolUse payload for an `ls -la` invocation.
 *
 * @param overrides - Specific fields to set.
 * @returns A complete PreToolUse payload.
 */
function makePayload(
  overrides: Partial<PreToolUsePayload> = {},
): PreToolUsePayload {
  return {
    hook_event_name: 'PreToolUse',
    session_id: 'test-session',
    transcript_path: '/dev/null',
    tool_name: 'Bash',
    tool_input: { command: 'ls -la' },
    ...overrides,
  };
}

describe('onPreToolUse', () => {
  it('emits continue and skips authorize when vat covers the call', async () => {
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: { 'test-session': makeSessionState() },
      }),
    });

    await onPreToolUse(makePayload(), deps);

    expect(deps.stdoutLines.join('')).toContain('"continue":true');
    expect(deps.rpc.authorizeRequest).not.toHaveBeenCalled();
    const events = deps.store.events.get('test-session') ?? [];
    expect(events.map((event) => event.event)).toContain('check');
  });

  it('continues immediately when no session can be created (daemon down)', async () => {
    const deps = makeFakeDeps();
    (deps.rpc.pingDaemon as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await onPreToolUse(makePayload(), deps);

    expect(deps.stdoutLines.join('')).toBe('{"continue":true}');
    expect(deps.rpc.authorizeRequest).not.toHaveBeenCalled();
    expect(deps.rpc.vatRoute).not.toHaveBeenCalled();
  });

  it('denies with a setup hint when the persisted state has no kernel session', async () => {
    const stateWithoutKernel: Record<string, unknown> = {
      ...makeSessionState(),
    };
    delete stateWithoutKernel.kernelSessionId;
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: {
          'test-session': stateWithoutKernel as ReturnType<
            typeof makeSessionState
          >,
        },
      }),
    });
    (deps.rpc.pingDaemon as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (deps.rpc.vatRoute as ReturnType<typeof vi.fn>).mockResolvedValue('ask');

    await onPreToolUse(makePayload(), deps);

    const output = deps.stdoutLines.join('');
    expect(output).toContain('"permissionDecision":"deny"');
    expect(output).toContain('/caprock:setup');
    expect(deps.rpc.authorizeRequest).not.toHaveBeenCalled();
  });

  it('asks the TUI when the vat does not cover the call, then accepts', async () => {
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: { 'test-session': makeSessionState() },
      }),
    });
    (deps.rpc.vatRoute as ReturnType<typeof vi.fn>).mockResolvedValue('ask');
    (deps.rpc.authorizeRequest as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeDecision({ verdict: 'accept', feedback: 'ok' }),
    );

    await onPreToolUse(makePayload(), deps);

    expect(deps.rpc.authorizeRequest).toHaveBeenCalledOnce();
    expect(deps.rpc.vatAddSection).toHaveBeenCalledOnce();
    expect(deps.stdoutLines.join('')).toContain('"continue":true');
    const events = deps.store.events.get('test-session') ?? [];
    expect(events.map((event) => event.event)).toContain('tui_accept');
  });

  it('denies with the TUI feedback when the TUI rejects', async () => {
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: { 'test-session': makeSessionState() },
      }),
    });
    (deps.rpc.vatRoute as ReturnType<typeof vi.fn>).mockResolvedValue('ask');
    (deps.rpc.authorizeRequest as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeDecision({ verdict: 'reject', feedback: 'no thanks' }),
    );

    await onPreToolUse(makePayload(), deps);

    expect(deps.stdoutLines.join('')).toContain('"permissionDecision":"deny"');
    expect(deps.stdoutLines.join('')).toContain('no thanks');
    expect(deps.rpc.vatAddSection).not.toHaveBeenCalled();
    const events = deps.store.events.get('test-session') ?? [];
    expect(events.map((event) => event.event)).toContain('tui_reject');
  });

  it('emits a connection hint when the TUI is not subscribed', async () => {
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: { 'test-session': makeSessionState() },
      }),
    });
    (deps.rpc.vatRoute as ReturnType<typeof vi.fn>).mockResolvedValue('ask');
    (deps.rpc.authorizeRequest as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('No subscriber'), { code: 'NO_SUBSCRIBER' }),
    );

    await onPreToolUse(makePayload(), deps);

    expect(deps.stdoutLines.join('')).toContain('TUI not connected');
    expect(deps.stdoutLines.join('')).toContain('"permissionDecision":"deny"');
  });

  it('records the matching provisions when the call auto-allows', async () => {
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: { 'test-session': makeSessionState() },
      }),
    });

    await onPreToolUse(makePayload(), deps);

    // recordProvisioned runs in a fire-and-forget background promise; wait one
    // microtask flush before asserting.
    await new Promise((resolve) => setImmediate(resolve));

    expect(deps.rpc.vatFindMatch).toHaveBeenCalled();
    expect(deps.rpc.recordProvisioned).toHaveBeenCalled();
  });
});
