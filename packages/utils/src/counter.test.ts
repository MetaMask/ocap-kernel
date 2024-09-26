import { describe, it, expect } from 'vitest';

import { makeCounter } from './counter.js';

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
