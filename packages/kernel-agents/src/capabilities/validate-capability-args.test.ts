import { describe, expect, it } from 'vitest';

import { validateCapabilityArgs } from './validate-capability-args.ts';

describe('validateCapabilityArgs', () => {
  it('accepts values matching primitive arg schemas', () => {
    expect(() =>
      validateCapabilityArgs(
        { a: 1, b: 2 },
        {
          description: 'add',
          args: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' },
            },
            required: ['a', 'b'],
          },
        },
      ),
    ).not.toThrow();
  });

  it('throws when a required argument is missing', () => {
    expect(() =>
      validateCapabilityArgs(
        { a: 1 },
        {
          description: 'add',
          args: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' },
            },
            required: ['a', 'b'],
          },
        },
      ),
    ).toThrow(/Missing required property "b"/u);
  });

  it('throws when a value does not match the schema', () => {
    expect(() =>
      validateCapabilityArgs(
        { a: 'not-a-number' },
        {
          description: 'x',
          args: {
            type: 'object',
            properties: { a: { type: 'number' } },
          },
        },
      ),
    ).toThrow(/Expected a number/u);
  });

  it('does nothing when there are no declared arguments', () => {
    expect(() =>
      validateCapabilityArgs(
        { extra: 1 },
        {
          description: 'ping',
          args: { type: 'object', properties: {} },
        },
      ),
    ).not.toThrow();
  });
});
