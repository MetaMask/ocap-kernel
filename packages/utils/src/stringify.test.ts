import { describe, it, expect } from 'vitest';

import { stringify } from './stringify.js';

describe('stringify', () => {
  it('stringifies a simple object with default indent', () => {
    const input = { key: 'value' };
    const result = stringify(input);
    expect(result).toBe(`{\n  "key": "value"\n}`);
  });

  it('stringifies a simple object with custom indent', () => {
    const input = { key: 'value' };
    const result = stringify(input, 4);
    expect(result).toBe(`{\n    "key": "value"\n}`);
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

  it('handles error objects with default indent', () => {
    const error = new Error('An error occurred');
    const result = stringify(error);
    const stackNewlines = error.stack?.replace(/\n/gu, '\\n');
    expect(result).toBe(
      `{\n  "name": "Error",\n  "message": "An error occurred",\n  "stack": "${stackNewlines}"\n}`,
    );
  });

  it('handles error objects with custom indent', () => {
    const error = new Error('Another error occurred');
    const result = stringify(error, 4);
    const stackNewlines = error.stack?.replace(/\n/gu, '\\n');
    expect(result).toBe(
      `{\n    "name": "Error",\n    "message": "Another error occurred",\n    "stack": "${stackNewlines}"\n}`,
    );
  });

  it('handles error objects with a cause', () => {
    const rootCause = new Error('Root cause error');
    const error = new Error('Caused error', { cause: rootCause });
    const result = stringify(error, 2);
    const stackNewlines = error.stack?.replace(/\n/gu, '\\n');
    expect(result).toBe(
      `{\n  "name": "Error",\n  "message": "Caused error",\n  "stack": "${stackNewlines}",\n  "cause": {\n    "name": "Error",\n    "message": "Root cause error"\n  }\n}`,
    );
  });
});
