import { describe, expect, it } from 'vitest';

import { makeDiscoverableExo } from './discoverable.ts';
import type { MethodSchema } from './schema.ts';

describe('makeDiscoverableExo', () => {
  const greetSchema: MethodSchema = {
    description: 'Greets a person by name',
    args: {
      name: {
        type: 'string',
        description: 'The name of the person to greet',
      },
    },
    returns: {
      type: 'string',
      description: 'A greeting message',
    },
  };

  const addSchema: MethodSchema = {
    description: 'Adds two numbers together',
    args: {
      a: {
        type: 'number',
        description: 'First number',
      },
      b: {
        type: 'number',
        description: 'Second number',
      },
    },
    returns: {
      type: 'number',
      description: 'The sum of the two numbers',
    },
  };

  const subtractSchema: MethodSchema = {
    description: 'Subtracts two numbers',
    args: {
      a: {
        type: 'number',
        description: 'First number',
      },
      b: {
        type: 'number',
        description: 'Second number',
      },
    },
    returns: {
      type: 'number',
      description: 'The difference of the two numbers',
    },
  };

  it('creates a discoverable exo with methods and schema', () => {
    const methods = {
      greet: (name: string) => `Hello, ${name}!`,
      add: (a: number, b: number) => a + b,
    };
    const schema = { greet: greetSchema, add: addSchema };

    const exo = makeDiscoverableExo('TestExo', methods, schema);

    expect(exo).toBeDefined();
    expect(exo.greet).toBeDefined();
    expect(exo.add).toBeDefined();
    expect(exo.describe).toBeDefined();
  });

  it('returns full schema when describe is called with no arguments', () => {
    const methods = { greet: (name: string) => `Hello, ${name}!` };
    const schema = { greet: greetSchema };

    const exo = makeDiscoverableExo('TestExo', methods, schema);

    expect(exo.describe()).toStrictEqual(schema);
  });

  it.each([
    { methodNames: ['greet'], expected: { greet: greetSchema } },
    {
      methodNames: ['greet', 'add'],
      expected: { greet: greetSchema, add: addSchema },
    },
    {
      methodNames: ['greet', 'add', 'subtract'],
      expected: {
        greet: greetSchema,
        add: addSchema,
        subtract: subtractSchema,
      },
    },
  ])(
    'returns partial schema when describe is called with method names $methodNames',
    ({ methodNames, expected }) => {
      const methods = {
        greet: (name: string) => `Hello, ${name}!`,
        add: (a: number, b: number) => a + b,
        subtract: (a: number, b: number) => a - b,
      };
      const schema = {
        greet: greetSchema,
        add: addSchema,
        subtract: subtractSchema,
      };

      const exo = makeDiscoverableExo('TestExo', methods, schema);

      expect(
        exo.describe(...(methodNames as (keyof typeof methods)[])),
      ).toStrictEqual(expected);
    },
  );

  it('preserves method functionality', () => {
    const methods = {
      greet: (name: string) => `Hello, ${name}!`,
      add: (a: number, b: number) => a + b,
    };
    const schema = { greet: greetSchema, add: addSchema };

    const exo = makeDiscoverableExo('TestExo', methods, schema);

    expect(exo.greet('Alice')).toBe('Hello, Alice!');
    expect(exo.add(5, 3)).toBe(8);
  });

  it('handles methods with no arguments', () => {
    const methods = { getValue: () => 42 };
    const schema: Record<keyof typeof methods, MethodSchema> = {
      getValue: {
        description: 'Returns a constant value',
        args: {},
        returns: { type: 'number', description: 'The constant value' },
      },
    };

    const exo = makeDiscoverableExo('TestExo', methods, schema);

    expect(exo.getValue()).toBe(42);
    expect(exo.describe('getValue')).toStrictEqual({
      getValue: schema.getValue,
    });
  });

  it('handles methods with no return value', () => {
    let called = false;
    const methods = {
      doSomething: () => {
        called = true;
      },
    };
    const schema: Record<keyof typeof methods, MethodSchema> = {
      doSomething: {
        description: 'Performs an action',
        args: {},
      },
    };

    const exo = makeDiscoverableExo('TestExo', methods, schema);

    exo.doSomething();
    expect(called).toBe(true);
    expect(exo.describe('doSomething')).toStrictEqual({
      doSomething: schema.doSomething,
    });
  });

  it('handles complex nested schemas', () => {
    const methods = {
      processData: (data: { name: string; age: number }) => ({
        result: 'processed',
        data,
      }),
    };
    const schema: Record<keyof typeof methods, MethodSchema> = {
      processData: {
        description: 'Processes user data',
        args: {
          data: {
            type: 'object',
            description: 'User data object',
            properties: {
              name: { type: 'string', description: 'User name' },
              age: { type: 'number', description: 'User age' },
            },
            required: ['name', 'age'],
          },
        },
        returns: {
          type: 'object',
          description: 'Processed result',
          properties: {
            result: { type: 'string', description: 'Processing status' },
            data: {
              type: 'object',
              description: 'Original data',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' },
              },
            },
          },
        },
      },
    };

    const exo = makeDiscoverableExo('TestExo', methods, schema);
    const result = exo.processData({ name: 'Alice', age: 30 });

    expect(result).toStrictEqual({
      result: 'processed',
      data: { name: 'Alice', age: 30 },
    });
    expect(exo.describe('processData')).toStrictEqual({
      processData: schema.processData,
    });
  });

  it('handles array schemas', () => {
    const methods = {
      sum: (numbers: number[]) => numbers.reduce((a, b) => a + b, 0),
    };
    const schema: Record<keyof typeof methods, MethodSchema> = {
      sum: {
        description: 'Sums an array of numbers',
        args: {
          numbers: {
            type: 'array',
            description: 'Array of numbers to sum',
            items: { type: 'number', description: 'A number' },
          },
        },
        returns: { type: 'number', description: 'The sum of all numbers' },
      },
    };

    const exo = makeDiscoverableExo('TestExo', methods, schema);

    expect(exo.sum([1, 2, 3, 4])).toBe(10);
    expect(exo.describe('sum')).toStrictEqual({ sum: schema.sum });
  });

  it('handles empty methods object', () => {
    const methods = {};
    const schema = {} as Record<keyof typeof methods, MethodSchema>;

    const exo = makeDiscoverableExo('TestExo', methods, schema);

    expect(exo.describe()).toStrictEqual({});
  });
});
