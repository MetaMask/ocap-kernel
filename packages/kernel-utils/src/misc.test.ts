import { describe, it, expect, vi } from 'vitest';

import { delay, makeCounter } from './misc.ts';

vi.useFakeTimers();

describe('makeCounter', () => {
  it('starts at 1 by default', () => {
    const counter = makeCounter();
    expect(counter()).toBe(1);
  });

  it('starts counting from the supplied argument', () => {
    const start = 50;
    const counter = makeCounter(start);
    expect(counter()).toStrictEqual(start + 1);
  });

  it('increments convincingly', () => {
    const counter = makeCounter();
    const first = counter();
    expect(counter()).toStrictEqual(first + 1);
    expect(counter()).toStrictEqual(first + 2);
    expect(counter()).toStrictEqual(first + 3);
  });
});

describe('delay', () => {
  it('delays execution by the specified number of milliseconds', async () => {
    const delayTime = 100;
    const delayP = delay(delayTime);
    vi.advanceTimersByTime(delayTime);
    expect(await delayP).toBeUndefined();
  });

  it('delays execution by the default number of milliseconds', async () => {
    const delayP = delay();
    vi.advanceTimersByTime(1);
    expect(await delayP).toBeUndefined();
  });
});
