import { Far } from '@endo/far';

export function buildRootObject(_, { name = 'unknown' }) {
  return Far('root', {
    hello: () => `Hello, ${name}!`,
    goodbye: () => `Goodbye, ${name}!`,
  });
}
