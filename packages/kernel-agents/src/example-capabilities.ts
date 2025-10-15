import { capability } from './capability.ts';

export const count = capability(
  async ({ word }: { word: string }) => word.length,
  {
    description: 'Count the number of characters in an arbitrary string',
    args: {
      word: { type: 'string', description: 'The string to get the length of.' },
    },
    returns: {
      type: 'number',
      description: 'The number of characters in the string.',
    },
  },
);

export const add = capability(
  async ({ summands }: { summands: number[] }) =>
    summands.reduce((acc, summand) => acc + summand, 0),
  {
    description: 'Add a list of numbers.',
    args: { summands: { type: 'array', item: { type: 'number' } } },
    returns: { type: 'number', description: 'The sum of the numbers.' },
  },
);

export const multiply = capability(
  async ({ factors }: { factors: number[] }) =>
    factors.reduce((acc, factor) => acc * factor, 1),
  {
    description: 'Multiply a list of numbers.',
    args: {
      factors: {
        type: 'array',
        description: 'The list of numbers to multiply.',
        item: { type: 'number' },
      },
    },
    returns: { type: 'number', description: 'The product of the factors.' },
  },
);

export const exampleCapabilities = {
  count,
  add,
  multiply,
};
