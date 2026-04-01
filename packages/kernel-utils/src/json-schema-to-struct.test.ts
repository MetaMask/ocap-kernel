import { assert } from '@metamask/superstruct';
import { describe, expect, it } from 'vitest';

import {
  jsonSchemaToStruct,
  methodArgsToStruct,
} from './json-schema-to-struct.ts';

describe('jsonSchemaToStruct', () => {
  it('validates string, number, and boolean', () => {
    assert('x', jsonSchemaToStruct({ type: 'string' }));
    assert(1, jsonSchemaToStruct({ type: 'number' }));
    assert(true, jsonSchemaToStruct({ type: 'boolean' }));
  });

  it('validates arrays recursively', () => {
    assert(
      [1, 2],
      jsonSchemaToStruct({ type: 'array', items: { type: 'number' } }),
    );
  });

  it('validates nested objects and required keys', () => {
    const struct = jsonSchemaToStruct({
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number' },
      },
    });
    assert({ a: 'hi', b: 1 }, struct);
    expect(() => assert({ a: 'hi' }, struct)).toThrow(
      /Missing required property "b"/u,
    );
  });

  it('rejects unknown keys when additionalProperties is false', () => {
    const struct = jsonSchemaToStruct({
      type: 'object',
      properties: { a: { type: 'string' } },
      additionalProperties: false,
    });
    assert({ a: 'x' }, struct);
    expect(() => assert({ a: 'x', b: 1 }, struct)).toThrow(/path: b/u);
  });

  it('allows unknown keys on objects when additionalProperties is not false', () => {
    const struct = jsonSchemaToStruct({
      type: 'object',
      properties: { a: { type: 'number' } },
    });
    assert({ a: 1, extra: 'ignored' }, struct);
  });
});

describe('methodArgsToStruct', () => {
  it('builds an object struct for method args', () => {
    const struct = methodArgsToStruct({
      a: { type: 'number' },
      b: { type: 'number' },
    });
    assert({ a: 1, b: 2 }, struct);
    expect(() => assert({ a: 1 }, struct)).toThrow(/path: b/u);
  });

  it('accepts an empty args map', () => {
    assert({}, methodArgsToStruct({}));
  });

  it('allows extra keys when the args map is empty', () => {
    assert({ extra: 1 }, methodArgsToStruct({}));
  });
});
