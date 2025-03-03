import { describe, it, expect } from 'vitest';

import { delay, makeCounter } from './misc.ts';

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
    const epsilon = 15;
    const target = 100;
    const start = Date.now();
    await delay(target);
    const end = Date.now();
    const delta = end - start;
    expect(delta).toBeGreaterThan(target - epsilon);
    expect(delta).toBeLessThan(target + epsilon); // Intentional large margin of error
  });
});
