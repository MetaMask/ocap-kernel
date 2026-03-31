import { describe, expect, it } from 'vitest';

import { parseJsonObject, parseToolArguments } from './parse-tool-arguments.ts';

const chatLabels = {
  invalidJson: 'Chat completion: invalid JSON in response body',
  notObject: 'Chat completion: response must be a JSON object',
} as const;

describe('parseJsonObject', () => {
  it('uses custom labels for invalid JSON', () => {
    expect(() => parseJsonObject('{x', chatLabels)).toThrow(SyntaxError);
    expect(() => parseJsonObject('{x', chatLabels)).toThrow(
      /Chat completion: invalid JSON in response body/u,
    );
  });

  it('uses custom labels when the value is not an object', () => {
    expect(() => parseJsonObject('[]', chatLabels)).toThrow(
      'Chat completion: response must be a JSON object',
    );
  });
});

describe('parseToolArguments', () => {
  it('returns a plain object for valid JSON object text', () => {
    expect(parseToolArguments('{"a":1}')).toStrictEqual({ a: 1 });
  });

  it('throws SyntaxError with context when JSON is invalid', () => {
    expect(() => parseToolArguments('{not json')).toThrow(SyntaxError);
    expect(() => parseToolArguments('{not json')).toThrow(
      /Invalid tool arguments JSON/u,
    );
  });

  it('throws when the value is not a plain object', () => {
    expect(() => parseToolArguments('[]')).toThrow(
      'Tool arguments must be a JSON object',
    );
    expect(() => parseToolArguments('null')).toThrow(
      'Tool arguments must be a JSON object',
    );
    expect(() => parseToolArguments('"x"')).toThrow(
      'Tool arguments must be a JSON object',
    );
  });
});
