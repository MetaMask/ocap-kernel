import { describe, it, expect, vi, afterEach } from 'vitest';

import { makeChannel } from './channel.ts';
import type { Channel } from './channel.ts';
import { makeSessionRegistry } from './session-registry.ts';
import type { Decision } from './types.ts';

// ---------------------------------------------------------------------------
// Channel bundle helper
// ---------------------------------------------------------------------------

type ChannelFactoryBundle = {
  createChannelInternal: () => Promise<{ ocapUrl: string; channel: Channel }>;
  getChannelByUrl: (url: string) => Channel | undefined;
};

function makeChannelBundle(): ChannelFactoryBundle {
  let counter = 0;
  const channelMap = new Map<string, Channel>();

  return {
    async createChannelInternal() {
      const ocapUrl = `ocap:channel-${counter}@mock`;
      counter += 1;
      const channel = makeChannel();
      channelMap.set(ocapUrl, channel);
      return { ocapUrl, channel };
    },
    getChannelByUrl(url: string): Channel | undefined {
      return channelMap.get(url);
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeDecision = (
  token: string,
  verdict: 'accept' | 'reject' = 'accept',
): Decision => ({ token, verdict, feedback: '' });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('makeSessionRegistry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('createSession creates a session with sessionId, ocapUrl, and startedAt', async () => {
    const registry = makeSessionRegistry(makeChannelBundle());
    const session = await registry.createSession();

    expect(typeof session.sessionId).toBe('string');
    expect(session.sessionId.length).toBeGreaterThan(0);
    expect(typeof session.ocapUrl).toBe('string');
    expect(session.ocapUrl.length).toBeGreaterThan(0);
    expect(typeof session.startedAt).toBe('string');
    // Verify startedAt is a valid ISO 8601 date string
    expect(Number.isNaN(Date.parse(session.startedAt))).toBe(false);
  });

  it.each([
    {
      label: 'stores cwd when provided',
      cwd: '/home/user/project',
      expected: '/home/user/project',
    },
  ])('$label', async ({ cwd, expected }) => {
    const registry = makeSessionRegistry(makeChannelBundle());
    const session = await registry.createSession({ cwd });
    expect(session.cwd).toBe(expected);
  });

  it('omits cwd when not provided', async () => {
    const registry = makeSessionRegistry(makeChannelBundle());
    const session = await registry.createSession();
    expect(Object.prototype.hasOwnProperty.call(session, 'cwd')).toBe(false);
  });

  it('listSessions returns all created sessions', async () => {
    const registry = makeSessionRegistry(makeChannelBundle());
    expect(registry.listSessions()).toStrictEqual([]);

    const sessionA = await registry.createSession();
    const sessionB = await registry.createSession();

    const sessions = registry.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions).toContain(sessionA);
    expect(sessions).toContain(sessionB);
  });

  it('getSession returns a session by id', async () => {
    const registry = makeSessionRegistry(makeChannelBundle());
    const session = await registry.createSession();
    expect(registry.getSession(session.sessionId)).toBe(session);
  });

  it('getSession returns undefined for an unknown id', async () => {
    const registry = makeSessionRegistry(makeChannelBundle());
    expect(registry.getSession('nonexistent')).toBeUndefined();
  });

  it('listHistory returns empty array initially', async () => {
    const registry = makeSessionRegistry(makeChannelBundle());
    const session = await registry.createSession();
    expect(session.listHistory()).toStrictEqual([]);
  });

  it.each([
    { verdict: 'accept' as const, expectedStatus: 'accepted' },
    { verdict: 'reject' as const, expectedStatus: 'rejected' },
  ])(
    'listHistory returns an entry with status $expectedStatus after queueRequest + decide',
    async ({ verdict, expectedStatus }) => {
      const registry = makeSessionRegistry(makeChannelBundle());
      const session = await registry.createSession();

      const token = session.queueRequest('Read /etc/hosts', 'needs DNS');
      session.decide(makeDecision(token, verdict));

      const history = session.listHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        token,
        description: 'Read /etc/hosts',
        reason: 'needs DNS',
        status: expectedStatus,
      });
      expect(typeof history[0]?.decidedAt).toBe('string');
    },
  );

  it('authorizeRequest resolves with the decision when decided', async () => {
    const registry = makeSessionRegistry(makeChannelBundle());
    const session = await registry.createSession();

    const authPromise = session.authorizeRequest(
      'Write /tmp/out',
      'needs temp',
    );

    // Retrieve the token from the pending list so we can decide it
    const pending = session.listPending();
    expect(pending).toHaveLength(1);
    const { token } = pending[0]!;

    const decision = makeDecision(token, 'accept');
    session.decide(decision);

    const result = await authPromise;
    expect(result).toStrictEqual(decision);
  });

  it('authorizeRequest rejects with timeout error after timeoutMs elapses', async () => {
    vi.useFakeTimers();
    try {
      const registry = makeSessionRegistry(makeChannelBundle());
      const session = await registry.createSession();

      const authPromise = session.authorizeRequest(
        'Execute script',
        'needs shell',
        500,
      );

      // Advance past the timeout — no subscriber decides, so the race rejects
      vi.advanceTimersByTime(600);

      await expect(authPromise).rejects.toMatchObject({
        message: 'No subscriber responded within timeout',
        code: 'NO_SUBSCRIBER',
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
