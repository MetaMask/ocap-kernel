import { describe, it, expect } from 'vitest';

import { pingHandler } from './ping.ts';

describe('pingHandler', () => {
  it('should return "pong"', () => {
    const result = pingHandler.implementation({}, []);
    expect(result).toBe('pong');
  });
});
