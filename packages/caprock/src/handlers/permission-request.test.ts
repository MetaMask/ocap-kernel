import { describe, expect, it, vi } from 'vitest';

import { onPermissionRequest } from './permission-request.ts';
import {
  makeFakeDeps,
  makeFakeStore,
  makeSessionState,
} from '../../test/handler-fakes.ts';

describe('onPermissionRequest', () => {
  it('emits permissionAllow when the vat covers the call', async () => {
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: { 'test-session': makeSessionState() },
      }),
    });

    await onPermissionRequest(
      {
        hook_event_name: 'PermissionRequest',
        session_id: 'test-session',
        transcript_path: '/dev/null',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
      },
      deps,
    );

    expect(deps.stdoutLines.join('')).toContain('"behavior":"allow"');
  });

  it('stays silent when the vat asks', async () => {
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: { 'test-session': makeSessionState() },
      }),
    });
    (deps.rpc.vatRoute as ReturnType<typeof vi.fn>).mockResolvedValue('ask');

    await onPermissionRequest(
      {
        hook_event_name: 'PermissionRequest',
        session_id: 'test-session',
        transcript_path: '/dev/null',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
      },
      deps,
    );

    expect(deps.stdoutLines.join('')).toBe('');
  });

  it('records a prompted event regardless of state', async () => {
    const deps = makeFakeDeps();

    await onPermissionRequest(
      {
        hook_event_name: 'PermissionRequest',
        session_id: 'test-session',
        transcript_path: '/dev/null',
      },
      deps,
    );

    const events = deps.store.events.get('test-session') ?? [];
    expect(events.map((event) => event.event)).toStrictEqual(['prompted']);
  });

  it('stays silent when no session state exists yet', async () => {
    const deps = makeFakeDeps();

    await onPermissionRequest(
      {
        hook_event_name: 'PermissionRequest',
        session_id: 'test-session',
        transcript_path: '/dev/null',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
      },
      deps,
    );

    expect(deps.stdoutLines.join('')).toBe('');
    expect(deps.rpc.vatRoute).not.toHaveBeenCalled();
  });
});
