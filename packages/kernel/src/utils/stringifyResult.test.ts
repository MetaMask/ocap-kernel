import { describe, it, expect } from 'vitest';

import { stringifyResult } from './stringifyResult.js';

describe('stringifyResult', () => {
  it('stringifies a simple object', () => {
    const input = { key: 'value' };
    const result = stringifyResult(input);
    expect(result).toBe(`{\n  "key": "value"\n}`);
  });

  it('stringifies an array', () => {
    const input = [1, 2, 3];
    const result = stringifyResult(input);
    expect(result).toBe(`[\n  1,\n  2,\n  3\n]`);
  });

  it('returns a string for a simple primitive', () => {
    expect(stringifyResult(42)).toBe('42');
    expect(stringifyResult('hello')).toBe('"hello"');
    expect(stringifyResult(true)).toBe('true');
  });

  it('handles null', () => {
    expect(stringifyResult(null)).toBe('null');
  });

  it('handles undefined', () => {
    expect(stringifyResult(undefined)).toBe('undefined');
  });

  it('handles circular references gracefully', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    const result = stringifyResult(obj);
    expect(result).toBe('[object Object]');
  });

  it('stringifies functions', () => {
    expect(
      stringifyResult(function example(): string {
        return 'hello';
      }),
    ).toBe('function example() {\n        return "hello";\n      }');
  });

  it('handles error objects gracefully', () => {
    const error = new Error('An error occurred');
    const result = stringifyResult(error);
    expect(result).toBe('{}');
  });
});
