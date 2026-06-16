import {
  matches,
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import { describe, expect, it } from 'vitest';

import { S } from './described.ts';

type MethodGuardPayload = {
  argGuards: unknown[];
  optionalArgGuards?: unknown[];
  returnGuard: unknown;
};

const payloadOf = (guard: unknown): MethodGuardPayload =>
  getMethodGuardPayload(guard as never) as unknown as MethodGuardPayload;

describe('leaves', () => {
  it.each([
    {
      name: 'string',
      described: S.string('a word'),
      schema: { type: 'string', description: 'a word' },
      ok: 'hello',
      bad: 42,
    },
    {
      name: 'number',
      described: S.number(),
      schema: { type: 'number' },
      ok: 42,
      bad: 'hello',
    },
    {
      name: 'boolean',
      described: S.boolean(),
      schema: { type: 'boolean' },
      ok: true,
      bad: 1,
    },
  ])(
    'builds a $name leaf whose pattern and schema agree',
    ({ described, schema, ok, bad }) => {
      expect(described.schema).toStrictEqual(schema);
      expect(matches(ok, described.pattern)).toBe(true);
      expect(matches(bad, described.pattern)).toBe(false);
    },
  );

  it('builds an arrayOf leaf', () => {
    const described = S.arrayOf(S.number(), 'the summands');
    expect(described.schema).toStrictEqual({
      type: 'array',
      items: { type: 'number' },
      description: 'the summands',
    });
    expect(matches([1, 2, 3], described.pattern)).toBe(true);
    expect(matches(['a'], described.pattern)).toBe(false);
  });

  it('builds an open record leaf that allows any keys', () => {
    const described = S.record('attachments');
    expect(described.schema).toStrictEqual({
      type: 'object',
      properties: {},
      additionalProperties: true,
      description: 'attachments',
    });
    expect(matches({ anything: 1, goes: 'here' }, described.pattern)).toBe(
      true,
    );
    expect(matches(42, described.pattern)).toBe(false);
  });

  it('builds a closed object leaf with required and optional properties', () => {
    const described = S.object(
      { id: S.string(), label: S.string() },
      { optional: ['label'] },
    );
    expect(described.schema).toStrictEqual({
      type: 'object',
      properties: { id: { type: 'string' }, label: { type: 'string' } },
      required: ['id'],
    });
    expect(matches({ id: 'x' }, described.pattern)).toBe(true);
    expect(matches({ id: 'x', label: 'y' }, described.pattern)).toBe(true);
    expect(matches({ label: 'y' }, described.pattern)).toBe(false);
  });

  it('builds a void return leaf with no schema', () => {
    const described = S.nothing();
    expect(described.schema).toBeUndefined();
    expect(matches(undefined, described.pattern)).toBe(true);
    expect(matches('something', described.pattern)).toBe(false);
  });
});

describe('S.method', () => {
  it('builds a guard and schema from named args', () => {
    const method = S.method(
      'Add a list of numbers.',
      [S.arg('summands', S.arrayOf(S.number()))],
      S.number('The sum of the numbers.'),
    );
    expect(method.schema).toStrictEqual({
      description: 'Add a list of numbers.',
      args: { summands: { type: 'array', items: { type: 'number' } } },
      returns: { type: 'number', description: 'The sum of the numbers.' },
    });
    const payload = payloadOf(method.guard);
    expect(payload.argGuards).toHaveLength(1);
    expect(payload.optionalArgGuards ?? []).toHaveLength(0);
  });

  it('omits `returns` from the schema for a void method', () => {
    const method = S.method(
      'Return a final response.',
      [S.arg('final', S.string())],
      S.nothing(),
    );
    expect(method.schema.returns).toBeUndefined();
    expect('returns' in method.schema).toBe(false);
  });

  it('places optional args in the guard as trailing optionals', () => {
    const method = S.method(
      'Return a final response.',
      [
        S.arg('final', S.string()),
        S.arg('attachments', S.record(), { optional: true }),
      ],
      S.nothing(),
    );
    const payload = payloadOf(method.guard);
    expect(payload.argGuards).toHaveLength(1);
    expect(payload.optionalArgGuards).toHaveLength(1);
    expect(method.schema.args).toStrictEqual({
      final: { type: 'string' },
      attachments: {
        type: 'object',
        properties: {},
        additionalProperties: true,
      },
    });
  });

  it('handles a no-arg method', () => {
    const method = S.method('Get the moon phase.', [], S.string());
    expect(method.schema.args).toStrictEqual({});
    expect(payloadOf(method.guard).argGuards).toHaveLength(0);
  });

  it('throws when an optional argument precedes a required one', () => {
    expect(() =>
      S.method(
        'bad',
        [S.arg('a', S.string(), { optional: true }), S.arg('b', S.string())],
        S.nothing(),
      ),
    ).toThrow(/optional arguments must be trailing/u);
  });
});

describe('S.interface', () => {
  it('collects method guards and schemas, defaulting unlisted methods to passable', () => {
    const { interfaceGuard, schemas } = S.interface('Math', {
      add: S.method(
        'Add a list of numbers.',
        [S.arg('summands', S.arrayOf(S.number()))],
        S.number('The sum of the numbers.'),
      ),
      count: S.method(
        'Count characters.',
        [S.arg('word', S.string('The string to measure.'))],
        S.number(),
      ),
    });

    expect(Object.keys(schemas)).toStrictEqual(['add', 'count']);
    const payload = getInterfaceGuardPayload(interfaceGuard) as unknown as {
      interfaceName: string;
      methodGuards: Record<string, unknown>;
      defaultGuards?: string;
    };
    expect(payload.interfaceName).toBe('Math');
    expect(Object.keys(payload.methodGuards)).toStrictEqual(['add', 'count']);
    expect(payload.defaultGuards).toBe('passable');
  });
});
