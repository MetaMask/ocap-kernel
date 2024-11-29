import { describe, it, expect } from 'vitest';

import { generateMethodSchema, isMethodSchema } from './method-schema.js';

describe('method-schema', () => {
  describe('generateMethodSchema', () => {
    it('handles various parameter formats', () => {
      const methods = {
        simpleMethod: (param1: string, param2: number) => `${param1} ${param2}`,
        optionalParam: (param?: string) => param,
        defaultValue: (param = false) => param,
        typeAnnotated: (param: unknown) => param,
        multipleSpaces: (param1: string, param2 = 123) => `${param1} ${param2}`,
        nullishParam: (param = null) => param,
        complexDefault: (param = { foo: 'bar' }) => param,
        multilineParams: (param1: string, param2 = 123, param3?: boolean) =>
          `${param1} ${param2} ${param3}`,
        noParams: () => null,
      };

      const expected = [
        { name: 'simpleMethod', parameters: ['param1', 'param2'] },
        { name: 'optionalParam', parameters: ['param'] },
        { name: 'defaultValue', parameters: ['param'] },
        { name: 'typeAnnotated', parameters: ['param'] },
        { name: 'multipleSpaces', parameters: ['param1', 'param2'] },
        { name: 'nullishParam', parameters: ['param'] },
        { name: 'complexDefault', parameters: ['param'] },
        {
          name: 'multilineParams',
          parameters: ['param1', 'param2', 'param3'],
        },
        { name: 'noParams', parameters: [] },
      ];

      const schemas = generateMethodSchema(methods);
      expect(schemas).toHaveLength(expected.length);
      expected.forEach((expectedSchema, index) => {
        expect(schemas[index]).toMatchObject(expectedSchema);
      });
    });
  });

  describe('isMethodSchema', () => {
    it.each([
      {
        schema: {
          name: 'test',
          parameters: [],
        },
        expected: true,
        description: 'validates minimal schema',
      },
      {
        schema: {
          name: 'test',
          parameters: ['param1', 'param2'],
          description: 'Test method',
        },
        expected: true,
        description: 'validates complete schema',
      },
      {
        schema: {
          name: 'test',
          parameters: [],
          description: undefined,
        },
        expected: true,
        description: 'validates schema with undefined optional field',
      },
      {
        schema: null,
        expected: false,
        description: 'rejects null',
      },
      {
        schema: {
          parameters: [],
        },
        expected: false,
        description: 'rejects missing name',
      },
      {
        schema: {
          name: 'test',
        },
        expected: false,
        description: 'rejects missing parameters',
      },
      {
        schema: {
          name: 123,
          parameters: [],
        },
        expected: false,
        description: 'rejects invalid name type',
      },
      {
        schema: {
          name: 'test',
          parameters: [123, 456],
        },
        expected: false,
        description: 'rejects non-string parameters',
      },
      {
        schema: {
          name: 'test',
          parameters: [],
          description: 123,
        },
        expected: false,
        description: 'rejects invalid description type',
      },
      {
        schema: {
          name: 'test',
          parameters: 'not-an-array',
        },
        expected: false,
        description: 'rejects non-array parameters',
      },
    ])('$description', ({ schema, expected }) => {
      expect(isMethodSchema(schema)).toBe(expected);
    });
  });
});
