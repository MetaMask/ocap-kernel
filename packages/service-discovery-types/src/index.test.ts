import { is } from '@metamask/superstruct';
import { describe, expect, it } from 'vitest';

import {
  jsonSchemaToObjectSpec,
  jsonSchemaToTypeSpec,
  methodSchemaToMethodSpec,
  methodsToRemotableSpec,
  ServiceDescriptionStruct,
  ServiceMatchListStruct,
  ServiceQueryStruct,
  TypeSpecStruct,
} from './index.ts';
import type {
  MethodSpec,
  RemotableSpec,
  ServiceDescription,
  TypeSpec,
} from './index.ts';

describe('TypeSpecStruct', () => {
  it.each([
    { kind: 'string' },
    { kind: 'number' },
    { kind: 'boolean' },
    { kind: 'null' },
    { kind: 'void' },
    { kind: 'undefined' },
    { kind: 'bigint' },
    { kind: 'unknown' },
  ] as TypeSpec[])('accepts primitive %o', (spec) => {
    expect(is(spec, TypeSpecStruct)).toBe(true);
  });

  it('accepts a nested array', () => {
    const spec: TypeSpec = {
      kind: 'array',
      elementType: { kind: 'string' },
    };
    expect(is(spec, TypeSpecStruct)).toBe(true);
  });

  it('accepts a union of primitives and remotables', () => {
    const spec: TypeSpec = {
      kind: 'union',
      members: [
        { kind: 'string' },
        {
          kind: 'remotable',
          spec: {
            methods: { ping: { parameters: [], returnType: { kind: 'void' } } },
          },
        },
      ],
    };
    expect(is(spec, TypeSpecStruct)).toBe(true);
  });

  it('rejects unknown kinds', () => {
    expect(is({ kind: 'bogus' }, TypeSpecStruct)).toBe(false);
  });
});

describe('ServiceDescriptionStruct', () => {
  it('accepts a minimal valid description', () => {
    const desc: ServiceDescription = {
      apiSpec: { properties: {} },
      description: 'a service',
      contact: [{ contactType: 'public', contactUrl: 'ocap:abc@peer' }],
    };
    expect(is(desc, ServiceDescriptionStruct)).toBe(true);
  });

  it('accepts multiple contact points', () => {
    const desc: ServiceDescription = {
      apiSpec: { properties: {} },
      description: 'a service',
      contact: [
        { contactType: 'public', contactUrl: 'ocap:a@peer' },
        { contactType: 'permissioned', contactUrl: 'ocap:b@peer' },
        { contactType: 'validatedClient', contactUrl: 'ocap:c@peer' },
      ],
    };
    expect(is(desc, ServiceDescriptionStruct)).toBe(true);
  });

  it('rejects an unknown contact type', () => {
    const bad = {
      apiSpec: { properties: {} },
      description: 'a service',
      contact: [{ contactType: 'guest', contactUrl: 'ocap:a@peer' }],
    };
    expect(is(bad, ServiceDescriptionStruct)).toBe(false);
  });

  it('rejects a missing description', () => {
    const bad = {
      apiSpec: { properties: {} },
      contact: [{ contactType: 'public', contactUrl: 'ocap:a@peer' }],
    };
    expect(is(bad, ServiceDescriptionStruct)).toBe(false);
  });
});

describe('ServiceQueryStruct', () => {
  it('accepts an NL query', () => {
    expect(
      is({ description: 'I want to sign messages' }, ServiceQueryStruct),
    ).toBe(true);
  });

  it('rejects a non-string description', () => {
    expect(is({ description: 42 }, ServiceQueryStruct)).toBe(false);
  });
});

describe('ServiceMatchListStruct', () => {
  it('accepts an empty list', () => {
    expect(is([], ServiceMatchListStruct)).toBe(true);
  });

  it('accepts a match with rationale', () => {
    const match = {
      description: {
        apiSpec: { properties: {} },
        description: 'svc',
        contact: [{ contactType: 'public' as const, contactUrl: 'ocap:a@p' }],
      },
      rationale: 'matches "sign" semantics',
    };
    expect(is([match], ServiceMatchListStruct)).toBe(true);
  });
});

describe('jsonSchemaToTypeSpec', () => {
  it.each([
    ['string', { kind: 'string' }],
    ['number', { kind: 'number' }],
    ['boolean', { kind: 'boolean' }],
  ] as const)('maps primitive %s', (type, expected) => {
    expect(jsonSchemaToTypeSpec({ type })).toStrictEqual(expected);
  });

  it('maps an array with item type', () => {
    expect(
      jsonSchemaToTypeSpec({ type: 'array', items: { type: 'string' } }),
    ).toStrictEqual({
      kind: 'array',
      elementType: { kind: 'string' },
    });
  });

  it('maps an object with required and optional properties', () => {
    const spec = jsonSchemaToTypeSpec({
      type: 'object',
      description: 'a point',
      properties: {
        x: { type: 'number', description: 'x coordinate' },
        y: { type: 'number' },
        label: { type: 'string' },
      },
      required: ['x', 'y'],
      additionalProperties: true,
    });
    expect(spec).toStrictEqual({
      kind: 'object',
      spec: {
        description: 'a point',
        properties: {
          x: {
            type: { kind: 'number' },
            description: 'x coordinate',
          },
          y: { type: { kind: 'number' } },
          label: { type: { kind: 'string' }, optional: true },
        },
        extensible: true,
      },
    });
  });
});

describe('jsonSchemaToObjectSpec', () => {
  it('omits description and extensible when absent', () => {
    expect(
      jsonSchemaToObjectSpec({
        type: 'object',
        properties: { a: { type: 'string' } },
        required: ['a'],
      }),
    ).toStrictEqual({
      properties: { a: { type: { kind: 'string' } } },
    });
  });
});

describe('methodSchemaToMethodSpec', () => {
  it('maps a method with args and return type', () => {
    const spec: MethodSpec = methodSchemaToMethodSpec({
      description: 'sign a message',
      args: {
        address: { type: 'string', description: '0x-prefixed address' },
        message: { type: 'string' },
      },
      returns: { type: 'string', description: 'signature' },
    });
    expect(spec).toStrictEqual({
      description: 'sign a message',
      parameters: [
        { description: '0x-prefixed address', type: { kind: 'string' } },
        { description: 'message', type: { kind: 'string' } },
      ],
      returnType: { kind: 'string' },
    });
  });

  it('defaults returnType to void when unspecified', () => {
    expect(
      methodSchemaToMethodSpec({ description: 'do a thing', args: {} }),
    ).toStrictEqual({
      description: 'do a thing',
      parameters: [],
      returnType: { kind: 'void' },
    });
  });
});

describe('methodsToRemotableSpec', () => {
  it('converts a map of methods and attaches a description', () => {
    const result: RemotableSpec = methodsToRemotableSpec({
      description: 'a signer',
      methods: {
        getAccounts: {
          description: 'list accounts',
          args: {},
          returns: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        signMessage: {
          description: 'sign a personal message',
          args: {
            address: { type: 'string' },
            message: { type: 'string' },
          },
          returns: { type: 'string' },
        },
      },
    });
    expect(result).toStrictEqual({
      description: 'a signer',
      methods: {
        getAccounts: {
          description: 'list accounts',
          parameters: [],
          returnType: {
            kind: 'array',
            elementType: { kind: 'string' },
          },
        },
        signMessage: {
          description: 'sign a personal message',
          parameters: [
            { description: 'address', type: { kind: 'string' } },
            { description: 'message', type: { kind: 'string' } },
          ],
          returnType: { kind: 'string' },
        },
      },
    });
  });
});
