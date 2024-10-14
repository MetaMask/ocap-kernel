import { VatNotFoundError } from '@ocap/errors';
import { describe, it, expect } from 'vitest';

import { stringify } from './stringify.js';

describe('stringify', () => {
  it.each([
    [
      { key: 'value' },
      2,
      `{\n  "key": "value"\n}`,
      'stringifies a simple object with default indent',
    ],
    [
      { key: 'value' },
      4,
      `{\n    "key": "value"\n}`,
      'stringifies a simple object with custom indent',
    ],
    [[1, 2, 3], 2, `[\n  1,\n  2,\n  3\n]`, 'stringifies an array'],
    [42, 2, '42', 'returns a string for a number'],
    ['hello', 2, '"hello"', 'returns a string for a string primitive'],
    [true, 2, 'true', 'returns a string for a boolean primitive'],
    [null, 2, 'null', 'handles null'],
    [undefined, 2, 'undefined', 'handles undefined'],
  ])(
    'should stringify %s with indent %i',
    (input, indent, expected, _description) => {
      const result = stringify(input, indent);
      expect(result).toBe(expected);
    },
  );

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

  it.each([
    [
      new Error('An error occurred'),
      2,
      `An error occurred`,
      'handles error objects with default indent',
    ],
    [
      new Error('Another error occurred'),
      4,
      `Another error occurred`,
      'handles error objects with custom indent',
    ],
  ])('should stringify simple error objects: %s', (error, indent, message) => {
    const stackNewlines = error.stack?.replace(/\n/gu, '\\n');
    const result = stringify(error, indent);
    expect(result).toContain(`"name": "Error"`);
    expect(result).toContain(`"message": "${message}"`);
    expect(result).toContain(`"stack": "${stackNewlines}"`);
  });

  it('handles error objects with an error cause that is an error', () => {
    const rootCause = new Error('Root cause error');
    const error = new Error('Caused error', { cause: rootCause });
    const result = stringify(error, 2);
    const stackNewlines = error.stack?.replace(/\n/gu, '\\n');
    const rootStackNewlines = rootCause.stack?.replace(/\n/gu, '\\n');
    expect(result).toBe(
      `{\n  "name": "Error",\n  "message": "Caused error",\n  "stack": "${stackNewlines}",\n  "cause": {\n    "name": "Error",\n    "message": "Root cause error",\n    "stack": "${rootStackNewlines}"\n  }\n}`,
    );
  });

  it('handles error objects with an error cause that is not an error', () => {
    const error = new Error('Caused error', { cause: 'root cause' });
    const result = stringify(error, 2);
    const stackNewlines = error.stack?.replace(/\n/gu, '\\n');
    expect(result).toBe(
      `{\n  "name": "Error",\n  "message": "Caused error",\n  "stack": "${stackNewlines}",\n  "cause": "\\"root cause\\""\n}`,
    );
  });

  it('handles ocap errors', () => {
    const error = new VatNotFoundError('v1');
    const result = stringify(error, 2);
    const stackNewlines = error.stack?.replace(/\n/gu, '\\n');
    expect(result).toBe(
      `{\n  "name": "VatNotFoundError",\n  "message": "Vat does not exist.",\n  "stack": "${stackNewlines}",\n  "code": "VAT_NOT_FOUND",\n  "data": "{\\n  \\"vatId\\": \\"v1\\"\\n}"\n}`,
    );
  });
});
