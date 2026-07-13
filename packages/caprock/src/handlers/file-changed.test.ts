import { describe, expect, it } from 'vitest';

import { onFileChanged } from './file-changed.ts';
import {
  makeFakeDeps,
  makeFakeStore,
  makeSessionState,
} from '../../test/handler-fakes.ts';

describe('onFileChanged', () => {
  it('records a rule_grant for each entry not previously in the snapshot', async () => {
    const settingsPath = '/tmp/settings.json';
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: {
          'test-session': makeSessionState({ settingsSnapshot: ['Bash(ls)'] }),
        },
        allowLists: {
          [settingsPath]: ['Bash(ls)', 'Bash(pwd)', 'Read(/tmp/*)'],
        },
      }),
    });

    await onFileChanged(
      {
        hook_event_name: 'FileChanged',
        session_id: 'test-session',
        transcript_path: '/dev/null',
        file_path: settingsPath,
        change_type: 'modify',
      },
      deps,
    );

    const events = deps.store.events.get('test-session') ?? [];
    const granted = events.filter((event) => event.event === 'rule_grant');
    expect(granted.map((event) => event.pattern)).toStrictEqual([
      'Bash(pwd)',
      'Read(/tmp/*)',
    ]);
    const saved = deps.store.states.get('test-session');
    expect(saved?.settingsSnapshot).toStrictEqual([
      'Bash(ls)',
      'Bash(pwd)',
      'Read(/tmp/*)',
    ]);
  });

  it('ignores delete events', async () => {
    const deps = makeFakeDeps({
      store: makeFakeStore({
        states: { 'test-session': makeSessionState() },
      }),
    });

    await onFileChanged(
      {
        hook_event_name: 'FileChanged',
        session_id: 'test-session',
        transcript_path: '/dev/null',
        file_path: '/tmp/settings.json',
        change_type: 'delete',
      },
      deps,
    );

    expect(deps.store.appendEvent).not.toHaveBeenCalled();
    expect(deps.store.readSettingsAllowList).not.toHaveBeenCalled();
  });

  it('is a no-op when no session state exists', async () => {
    const deps = makeFakeDeps();

    await onFileChanged(
      {
        hook_event_name: 'FileChanged',
        session_id: 'test-session',
        transcript_path: '/dev/null',
        file_path: '/tmp/settings.json',
        change_type: 'modify',
      },
      deps,
    );

    expect(deps.store.appendEvent).not.toHaveBeenCalled();
  });
});
