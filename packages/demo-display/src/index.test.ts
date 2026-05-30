import { describe, expect, it } from 'vitest';

import greet from './index.ts';

describe('Test', () => {
  it('greets', () => {
    const name = 'Huey';
    const result = greet(name);
    expect(result).toBe('Hello, Huey!');
  });
});
