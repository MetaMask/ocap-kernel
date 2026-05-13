import { describe, expect, it, vi } from 'vitest';

import { makeChannel } from './channel.ts';
import type { Decision, SectionNotification } from './types.ts';

const makeNotification = (token = 't0'): SectionNotification => ({
  token,
  description: 'Allow read',
  reason: 'needs file',
  guard: { body: '#{}', slots: [] },
});

const makeDecision = (
  token = 't0',
  verdict: 'accept' | 'reject' = 'accept',
): Decision => ({ token, verdict, feedback: '' });

const makeStream = () => {
  const decisions: Decision[] = [];
  const written: SectionNotification[] = [];
  let resolveNext:
    | ((result: IteratorResult<Decision, undefined>) => void)
    | undefined;
  let closed = false;

  const stream = {
    write: vi.fn(async (notification: SectionNotification) => {
      written.push(notification);
    }),
    push(decision: Decision) {
      decisions.push(decision);
      resolveNext?.({ done: false, value: decision });
      resolveNext = undefined;
    },
    close() {
      closed = true;
      resolveNext?.({ done: true, value: undefined });
      resolveNext = undefined;
    },
    written,
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<Decision, undefined>> {
          if (closed) {
            return { done: true, value: undefined };
          }
          const decision = decisions.shift();
          if (decision !== undefined) {
            return { done: false, value: decision };
          }
          return new Promise((resolve) => {
            resolveNext = resolve;
          });
        },
        async return(): Promise<IteratorResult<Decision, undefined>> {
          return { done: true, value: undefined };
        },
      };
    },
  };
  return stream;
};

describe('makeChannel', () => {
  it('broadcasts a notification to a subscribed stream', async () => {
    const channel = makeChannel();
    const stream = makeStream();
    channel.subscribe(stream);

    const notification = makeNotification();
    channel.broadcast(notification).catch(() => undefined);
    await vi.waitFor(() => expect(stream.written).toHaveLength(1));
    expect(stream.written[0]).toStrictEqual(notification);
  });

  it('broadcast resolves when subscriber sends matching decision', async () => {
    const channel = makeChannel();
    const stream = makeStream();
    channel.subscribe(stream);

    const decisionPromise = channel.broadcast(makeNotification('t1'));
    await vi.waitFor(() => expect(stream.written).toHaveLength(1));

    stream.push(makeDecision('t1', 'accept'));
    const decision = await decisionPromise;
    expect(decision).toStrictEqual(makeDecision('t1', 'accept'));
  });

  it('ignores decisions for unknown tokens', async () => {
    const channel = makeChannel();
    const stream = makeStream();
    channel.subscribe(stream);

    const decisionPromise = channel.broadcast(makeNotification('t1'));
    await vi.waitFor(() => expect(stream.written).toHaveLength(1));

    stream.push(makeDecision('unknown', 'accept'));
    stream.push(makeDecision('t1', 'accept'));
    const decision = await decisionPromise;
    expect(decision.token).toBe('t1');
  });

  it('replays pending notifications to a subscriber that connects late', async () => {
    const channel = makeChannel();
    const notification = makeNotification('t0');
    channel.broadcast(notification).catch(() => undefined);

    const stream = makeStream();
    channel.subscribe(stream);

    await vi.waitFor(() => expect(stream.written).toHaveLength(1));
    expect(stream.written[0]).toStrictEqual(notification);
  });

  it('replays pending notifications to a new subscriber even after a previous subscriber received them', async () => {
    const channel = makeChannel();
    const streamA = makeStream();
    channel.subscribe(streamA);

    const notification = makeNotification('t0');
    channel.broadcast(notification).catch(() => undefined);
    await vi.waitFor(() => expect(streamA.written).toHaveLength(1));

    // streamA received the notification but hasn't decided yet — streamB should
    // also receive it via pending replay.
    const streamB = makeStream();
    channel.subscribe(streamB);
    await vi.waitFor(() => expect(streamB.written).toHaveLength(1));
    expect(streamB.written[0]).toStrictEqual(notification);
  });

  it('broadcasts to multiple subscribers', async () => {
    const channel = makeChannel();
    const streamA = makeStream();
    const streamB = makeStream();
    channel.subscribe(streamA);
    channel.subscribe(streamB);

    channel.broadcast(makeNotification('t0')).catch(() => undefined);
    await vi.waitFor(() => expect(streamA.written).toHaveLength(1));
    await vi.waitFor(() => expect(streamB.written).toHaveLength(1));
  });

  it('listPending returns notifications not yet decided', async () => {
    const channel = makeChannel();
    expect(channel.listPending()).toStrictEqual([]);

    const notification = makeNotification('t0');
    channel.broadcast(notification).catch(() => undefined);
    expect(channel.listPending()).toStrictEqual([notification]);
  });

  it('decide resolves the pending broadcast promise', async () => {
    const channel = makeChannel();
    const notification = makeNotification('t0');
    const decisionPromise = channel.broadcast(notification);

    const decision = makeDecision('t0', 'accept');
    channel.decide(decision);
    expect(await decisionPromise).toStrictEqual(decision);
    expect(channel.listPending()).toStrictEqual([]);
  });

  it('decide is a no-op for unknown tokens', () => {
    const channel = makeChannel();
    expect(() => channel.decide(makeDecision('unknown'))).not.toThrow();
  });

  it('rejects pending broadcasts when the last subscriber disconnects cleanly', async () => {
    const channel = makeChannel();
    const stream = makeStream();
    channel.subscribe(stream);

    const decisionPromise = channel.broadcast(makeNotification('t0'));
    await vi.waitFor(() => expect(stream.written).toHaveLength(1));

    stream.close();
    await expect(decisionPromise).rejects.toThrow(
      'All subscribers disconnected',
    );
  });

  it('does not replay a notification to new subscribers once it has been decided', async () => {
    const channel = makeChannel();
    const notification = makeNotification('t0');
    const decisionPromise = channel.broadcast(notification);

    const streamA = makeStream();
    channel.subscribe(streamA);
    await vi.waitFor(() => expect(streamA.written).toHaveLength(1));

    streamA.push(makeDecision('t0', 'accept'));
    await decisionPromise;

    const streamB = makeStream();
    channel.subscribe(streamB);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(streamB.written).toHaveLength(0);
  });
});
