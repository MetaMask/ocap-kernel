import { Far } from '@endo/far';

export function buildRootObject(_, { name = 'Carol' }) {
  return Far('root', {
    getName: () => name,

    // Returns an incrementing counter.
    foo: () => {
      let counter = 0;
      return Far(`${name}'s foo`, {
        inc: () => counter++,
      });
    },
  });
}
