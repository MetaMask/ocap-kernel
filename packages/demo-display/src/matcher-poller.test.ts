import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DaemonCaller } from './daemon-caller.ts';
import { makeEventLog } from './event-log.ts';
import { startMatcherPoller } from './matcher-poller.ts';
import type { ServiceDescriptionPayload } from './types.ts';

const makeDescription = (providerTag: string): ServiceDescriptionPayload => ({
  providerTag,
  description: 'desc',
  methods: { foo: {} },
});

type ListAllEntry = { id: string; description: ServiceDescriptionPayload };

const makeFakeDaemon = (responses: ListAllEntry[][]): DaemonCaller => {
  let index = 0;
  return {
    redeemUrl: vi.fn(),
    queueMessage: vi.fn(async () => {
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return response;
    }),
  };
};

const flushPolls = async (count: number): Promise<void> => {
  for (let step = 0; step < count; step += 1) {
    await vi.runOnlyPendingTimersAsync();
  }
};

describe('startMatcherPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits service.registered for each new entry on first poll', async () => {
    const log = makeEventLog();
    const daemon = makeFakeDaemon([
      [
        { id: '1', description: makeDescription('a') },
        { id: '2', description: makeDescription('b') },
      ],
    ]);

    const poller = startMatcherPoller({
      daemonCaller: daemon,
      observerKref: 'k1',
      intervalMs: 1_000,
      eventLog: log,
      now: () => 0,
    });

    await flushPolls(1);
    poller.stop();

    expect(log.recent()).toStrictEqual([
      {
        kind: 'service.registered',
        id: '1',
        description: makeDescription('a'),
        at: new Date(0).toISOString(),
      },
      {
        kind: 'service.registered',
        id: '2',
        description: makeDescription('b'),
        at: new Date(0).toISOString(),
      },
    ]);
  });

  it('emits service.evicted when an id disappears from listAll', async () => {
    const log = makeEventLog();
    const daemon = makeFakeDaemon([
      [{ id: '1', description: makeDescription('a') }],
      [],
    ]);

    const poller = startMatcherPoller({
      daemonCaller: daemon,
      observerKref: 'k1',
      intervalMs: 1_000,
      eventLog: log,
      now: () => 0,
    });

    await flushPolls(3);
    poller.stop();

    const kinds = log.recent().map((event) => event.kind);
    expect(kinds).toStrictEqual(['service.registered', 'service.evicted']);
  });

  it('does not re-emit registered for entries seen on the previous poll', async () => {
    const log = makeEventLog();
    const daemon = makeFakeDaemon([
      [{ id: '1', description: makeDescription('a') }],
      [{ id: '1', description: makeDescription('a') }],
    ]);

    const poller = startMatcherPoller({
      daemonCaller: daemon,
      observerKref: 'k1',
      intervalMs: 1_000,
      eventLog: log,
      now: () => 0,
    });

    await flushPolls(3);
    poller.stop();

    expect(log.recent()).toHaveLength(1);
  });

  it('routes failures to onError without crashing the loop', async () => {
    const log = makeEventLog();
    const onError = vi.fn();
    const daemon: DaemonCaller = {
      redeemUrl: vi.fn(),
      queueMessage: vi
        .fn()
        .mockRejectedValueOnce(new Error('first boom'))
        .mockResolvedValue([{ id: '1', description: makeDescription('a') }]),
    };

    const poller = startMatcherPoller({
      daemonCaller: daemon,
      observerKref: 'k1',
      intervalMs: 1_000,
      eventLog: log,
      now: () => 0,
      onError,
    });

    await flushPolls(3);
    poller.stop();

    expect(onError).toHaveBeenCalled();
    expect(log.recent().map((event) => event.kind)).toStrictEqual([
      'service.registered',
    ]);
  });

  it('stops polling after stop()', async () => {
    const log = makeEventLog();
    const daemon = makeFakeDaemon([[]]);

    const poller = startMatcherPoller({
      daemonCaller: daemon,
      observerKref: 'k1',
      intervalMs: 1_000,
      eventLog: log,
      now: () => 0,
    });

    await flushPolls(2);
    const callsBeforeStop = (daemon.queueMessage as ReturnType<typeof vi.fn>)
      .mock.calls.length;

    poller.stop();
    await flushPolls(5);

    expect(daemon.queueMessage).toHaveBeenCalledTimes(callsBeforeStop);
  });
});
