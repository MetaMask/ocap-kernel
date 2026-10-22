import { S } from '@metamask/kernel-utils';

import { makeInternalCapabilities } from './discover.ts';

const capabilities = makeInternalCapabilities(
  'Math',
  {
    async count(word: string) {
      return word.length;
    },
    async add(summands: number[]) {
      return summands.reduce((acc, summand) => acc + summand, 0);
    },
    async multiply(factors: number[]) {
      return factors.reduce((acc, factor) => acc * factor, 1);
    },
  },
  S.interface('Math', {
    count: S.method(
      'Count the number of characters in an arbitrary string',
      [S.arg('word', S.string('The string to get the length of.'))],
      S.number('The number of characters in the string.'),
    ),
    add: S.method(
      'Add a list of numbers.',
      [S.arg('summands', S.arrayOf(S.number()))],
      S.number('The sum of the numbers.'),
    ),
    multiply: S.method(
      'Multiply a list of numbers.',
      [
        S.arg(
          'factors',
          S.arrayOf(S.number(), 'The list of numbers to multiply.'),
        ),
      ],
      S.number('The product of the factors.'),
    ),
  }),
);

export const { count, add, multiply } = capabilities;
export default capabilities;
