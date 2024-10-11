import { describe, it, expect } from 'vitest';

import { asError } from './asError.js';

describe('asError', () => {
  it('should return the input if it is already an Error', () => {
    const originalError = new Error('Existing error');
    const result = asError(originalError);

    expect(result).toBe(originalError);
    expect(result.message).toBe('Existing error');
  });

  it.each([
    { input: 'Some error string', expectedCause: 'Some error string' },
    { input: 404, expectedCause: 404 },
    { input: { key: 'value' }, expectedCause: { key: 'value' } },
    { input: ['error', 'details'], expectedCause: ['error', 'details'] },
    { input: null, expectedCause: null },
    { input: undefined, expectedCause: undefined },
    { input: true, expectedCause: true },
  ])(
    'should create a new Error if the input is not an Error object',
    ({ input, expectedCause }) => {
      const result = asError(input);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('Unknown');
      expect(result.cause).toStrictEqual(expectedCause);
    },
  );

  it('should create a new Error if the input is a symbol', () => {
    const problem = Symbol('error');
    const result = asError(problem);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Unknown');
    expect(typeof result.cause).toBe('symbol');
    expect(result.cause).toBe(problem);
  });

  it('should create a new Error if the input is a function', () => {
    const problem = (): string => 'problem';
    const result = asError(problem);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Unknown');
    expect(typeof result.cause).toBe('function');
    expect(result.cause).toBe(problem);
  });
});
