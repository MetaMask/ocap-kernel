import { is } from '@metamask/superstruct';
import { describe, expect, it } from 'vitest';

import { KernelSessionStruct } from './structs.ts';

describe('KernelSessionStruct', () => {
  // These fixtures mirror the object the daemon returns from `session.create`
  // (and each entry of `session.list`) in
  // packages/kernel-node-runtime/src/daemon/rpc-socket-server.ts. The struct is
  // a strict `object()`, so it rejects any field it does not declare — if the
  // daemon adds a field to that response, extend both the struct and this
  // fixture. A prior omission of `lastActiveAt` made every `session.create`
  // response fail `assert(result, KernelSessionStruct)` in
  // `createKernelSession`, which broke the SessionStart and PreToolUse hooks.
  it.each([
    {
      shape: 'full response',
      response: {
        sessionId: 'alice',
        ocapUrl: 'ocap://kernel/session/alice',
        cwd: '/home/user/project',
        startedAt: '2026-07-01T00:00:00.000Z',
        lastActiveAt: '2026-07-01T00:05:00.000Z',
      },
    },
    {
      shape: 'minimal response (optional fields absent)',
      response: {
        sessionId: 'bob',
        ocapUrl: 'ocap://kernel/session/bob',
      },
    },
  ])('accepts the daemon session.create $shape', ({ response }) => {
    expect(is(response, KernelSessionStruct)).toBe(true);
  });
});
