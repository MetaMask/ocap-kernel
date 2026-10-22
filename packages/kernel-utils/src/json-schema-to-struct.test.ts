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

  describe('interface', () => {
    const interfaceSchema = {
      type: 'interface',
      description: 'a reviser',
      methods: {
        revise: { description: 'revise it', args: {} },
      },
    } as const;

    it('accepts any object reference without introspecting its methods', () => {
      const struct = jsonSchemaToStruct(interfaceSchema);
      // The declared `methods` are a description for the caller, not a
      // shape to enforce here: whether the object honours them is only
      // discoverable by invoking it, which is the receiver's business.
      assert({}, struct);
      assert({ revise: () => undefined }, struct);
      assert({ somethingElse: 1 }, struct);
    });

    it.each([
      ['a string', 'not an object'],
      ['a number', 42],
      ['a boolean', true],
      ['null', null],
      ['undefined', undefined],
    ])('rejects %s', (_label, value) => {
      const struct = jsonSchemaToStruct(interfaceSchema);
      expect(() => assert(value, struct)).toThrow(
        /Expected an object reference/u,
      );
    });
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

  it('treats args absent from `required` as optional', () => {
    const struct = methodArgsToStruct(
      {
        final: { type: 'string' },
        attachments: { type: 'object', properties: {} },
      },
      { required: ['final'] },
    );
    assert({ final: 'done' }, struct);
    assert({ final: 'done', attachments: { note: 1 } }, struct);
    expect(() => assert({ attachments: {} }, struct)).toThrow(/final/u);
  });

  it('accepts an empty args map', () => {
    assert({}, methodArgsToStruct({}));
  });

  it('allows extra keys when the args map is empty', () => {
    assert({ extra: 1 }, methodArgsToStruct({}));
  });
});
