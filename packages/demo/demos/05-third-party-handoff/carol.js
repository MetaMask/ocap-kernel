import { Far } from '@endo/far';

export function buildRootObject(_, { name = 'Carol' }) {
  return Far('root', {
    getName: () => name,

    makeCounter: () => {
      let count = 0;
      return Far(`${name}'s counter`, {
        inc: () => count++,
      });
    },
  });
}
