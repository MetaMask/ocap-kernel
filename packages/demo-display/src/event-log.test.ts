import { describe, it, expect, vi } from 'vitest';

import { makeEventLog } from './event-log.ts';
import type { DisplayEvent } from './types.ts';

const makeRegistered = (id: string): DisplayEvent => ({
  kind: 'service.registered',
  id,
  description: { providerTag: id, description: '', methods: {} },
  at: '2026-01-01T00:00:00.000Z',
});

describe('makeEventLog', () => {
  it('retains appended events for replay', () => {
    const log = makeEventLog();
    log.append(makeRegistered('a'));
    log.append(makeRegistered('b'));

    expect(log.recent().map((event) => event.id)).toStrictEqual(['a', 'b']);
  });

  it('caps retained events at capacity', () => {
    const log = makeEventLog({ capacity: 2 });
    log.append(makeRegistered('a'));
    log.append(makeRegistered('b'));
    log.append(makeRegistered('c'));

    expect(log.recent().map((event) => event.id)).toStrictEqual(['b', 'c']);
  });

  it('forwards each appended event to live subscribers', () => {
    const log = makeEventLog();
    const subscriber = vi.fn();
    log.subscribe(subscriber);

    const event = makeRegistered('a');
    log.append(event);

    expect(subscriber).toHaveBeenCalledExactlyOnceWith(event);
  });

  it('stops calling a subscriber after unsubscribe', () => {
    const log = makeEventLog();
    const subscriber = vi.fn();
    const unsubscribe = log.subscribe(subscriber);

    log.append(makeRegistered('a'));
    unsubscribe();
    log.append(makeRegistered('b'));

    expect(subscriber).toHaveBeenCalledOnce();
  });

  it('isolates a throwing subscriber from later subscribers', () => {
    const log = makeEventLog();
    const throwing = vi.fn(() => {
      throw new Error('boom');
    });
    const healthy = vi.fn();
    log.subscribe(throwing);
    log.subscribe(healthy);

    log.append(makeRegistered('a'));

    expect(throwing).toHaveBeenCalledOnce();
    expect(healthy).toHaveBeenCalledOnce();
  });
});
