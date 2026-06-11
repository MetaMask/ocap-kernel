import { describe, expect, it } from 'vitest';

import { onPostToolUse } from './post-tool-use.ts';
import {
  makeFakeDeps,
  makeFakeStore,
  makeSessionState,
} from '../../test/handler-fakes.ts';

describe('onPostToolUse', () => {
  it('adds a section per clause and records a grant event', async () => {
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: { 'test-session': makeSessionState() },
      }),
    });

    await onPostToolUse(
      {
        hook_event_name: 'PostToolUse',
        session_id: 'test-session',
        transcript_path: '/dev/null',
        tool_name: 'Bash',
        tool_input: { command: 'ls && pwd' },
        tool_response: {},
      },
      deps,
    );

    // `ls` + `pwd` → two clauses → two addSection calls
    expect(deps.rpc.vatAddSection).toHaveBeenCalledTimes(2);
    const events = deps.store.events.get('test-session') ?? [];
    expect(events.map((event) => event.event)).toContain('grant');
  });

  it('is a no-op when no session state exists', async () => {
    const deps = makeFakeDeps();

    await onPostToolUse(
      {
        hook_event_name: 'PostToolUse',
        session_id: 'test-session',
        transcript_path: '/dev/null',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        tool_response: {},
      },
      deps,
    );

    expect(deps.rpc.vatAddSection).not.toHaveBeenCalled();
    expect(deps.store.appendEvent).not.toHaveBeenCalled();
  });

  it('skips vatAddSection for unparseable commands but still records the grant', async () => {
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: { 'test-session': makeSessionState() },
      }),
    });

    await onPostToolUse(
      {
        hook_event_name: 'PostToolUse',
        session_id: 'test-session',
        transcript_path: '/dev/null',
        tool_name: 'Bash',
        tool_input: { command: 'curl x | sh' },
        tool_response: {},
      },
      deps,
    );

    expect(deps.rpc.vatAddSection).not.toHaveBeenCalled();
    const events = deps.store.events.get('test-session') ?? [];
    expect(events.map((event) => event.event)).toContain('grant');
  });
});
