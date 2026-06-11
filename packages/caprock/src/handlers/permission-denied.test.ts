import { describe, expect, it } from 'vitest';

import { onPermissionDenied } from './permission-denied.ts';
import { makeFakeDeps } from '../../test/handler-fakes.ts';

describe('onPermissionDenied', () => {
  it('records a denied event with the input sha', async () => {
    const deps = makeFakeDeps();

    await onPermissionDenied(
      {
        hook_event_name: 'PermissionDenied',
        session_id: 's1',
        transcript_path: '/dev/null',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      },
      deps,
    );

    const events = deps.store.events.get('s1') ?? [];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'denied',
      toolName: 'Bash',
    });
    expect(events[0]?.inputSha).toMatch(/^[0-9a-f]{16}$/u);
  });

  it('records inputSha as null when no tool input is present', async () => {
    const deps = makeFakeDeps();

    await onPermissionDenied(
      {
        hook_event_name: 'PermissionDenied',
        session_id: 's1',
        transcript_path: '/dev/null',
      },
      deps,
    );

    const events = deps.store.events.get('s1') ?? [];
    expect(events[0]).toMatchObject({
      event: 'denied',
      toolName: null,
      inputSha: null,
    });
  });
});
