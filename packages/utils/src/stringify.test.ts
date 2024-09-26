import { describe, it, expect } from 'vitest';

import { stringify } from './stringify.js';

describe('stringify', () => {
  it('stringifies a simple object', () => {
    const input = { key: 'value' };
    const result = stringify(input);
    expect(result).toBe(`{\n  "key": "value"\n}`);
  });

  it('stringifies an array', () => {
    const input = [1, 2, 3];
    const result = stringify(input);
    expect(result).toBe(`[\n  1,\n  2,\n  3\n]`);
  });

  it('returns a string for a simple primitive', () => {
    expect(stringify(42)).toBe('42');
    expect(stringify('hello')).toBe('"hello"');
    expect(stringify(true)).toBe('true');
  });

  it('handles null', () => {
    expect(stringify(null)).toBe('null');
  });

  it('handles undefined', () => {
    expect(stringify(undefined)).toBe('undefined');
  });

  it('handles circular references gracefully', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    const result = stringify(obj);
    expect(result).toBe('[object Object]');
  });

  it('stringifies functions', () => {
    expect(
      stringify(function example(): string {
        return 'hello';
      }),
    ).toBe('function example() {\n        return "hello";\n      }');
  });

  it('handles error objects gracefully', () => {
    const error = new Error('An error occurred');
    const result = stringify(error);
    expect(result).toBe('{}');
  });
});
