import { Far } from '@endo/far';

export function buildRootObject(_, { name }) {
  return Far('root', {
    foo: () => {
      console.log(`${name}: foo`);
      return `${name}'s foo`;
    },
  });
}
