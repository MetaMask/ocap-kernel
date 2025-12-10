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

  it('returns full schema when describe is called', () => {
    const methods = { greet: (name: string) => `Hello, ${name}!` };
    const schema = { greet: greetSchema };

    const exo = makeDiscoverableExo('TestExo', methods, schema);

    expect(exo.describe()).toStrictEqual(schema);
  });

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
    expect(exo.describe()).toStrictEqual({
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
    expect(exo.describe()).toStrictEqual({
      doSomething: schema.doSomething,
    });
  });
});
