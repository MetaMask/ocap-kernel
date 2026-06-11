import { describe, expect, it, vi } from 'vitest';

import { onSessionStart } from './session-start.ts';
import { makeFakeDeps } from '../../test/handler-fakes.ts';

describe('onSessionStart', () => {
  it('initializes the session, writes the connect file, and emits the greeting', async () => {
    const deps = makeFakeDeps();

    await onSessionStart(
      {
        hook_event_name: 'SessionStart',
        session_id: 's1',
        transcript_path: '/tmp/transcript.jsonl',
      },
      deps,
    );

    expect(deps.registerSkillPermissions).toHaveBeenCalledOnce();
    expect(deps.rpc.launchPermissionVat).toHaveBeenCalledOnce();
    expect(deps.rpc.createKernelSession).toHaveBeenCalledOnce();
    expect(deps.writeConnectFile).toHaveBeenCalledWith(
      'ocap modal kernel-test-session',
    );
    expect(deps.stdoutLines.join('')).toContain('[caprock] tracking authority');
    const events = deps.store.events.get('s1') ?? [];
    expect(events.map((event) => event.event)).toStrictEqual(['session_start']);
  });

  it('emits a passthrough notice when the daemon is unavailable', async () => {
    const deps = makeFakeDeps();
    (deps.rpc.pingDaemon as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await onSessionStart(
      {
        hook_event_name: 'SessionStart',
        session_id: 's1',
        transcript_path: '/tmp/transcript.jsonl',
      },
      deps,
    );

    expect(deps.stdoutLines.join('')).toContain('authority tracking inactive');
    expect(deps.writeConnectFile).not.toHaveBeenCalled();
    expect(deps.store.appendEvent).not.toHaveBeenCalled();
  });
});
