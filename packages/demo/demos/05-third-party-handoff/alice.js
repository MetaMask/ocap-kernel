import { E, Far } from '@endo/far';

export function buildRootObject(_, { name = 'Alice' }) {
  let cap = null;
  let counter = null;

  return Far('root', {
    getName: () => name,

    introduce: async (whom) => `${name}~>${await E((cap = whom)).getName()}`,

    getCounter: async () => {
      counter = await E(cap).makeCounter();
      console.log(`${name}: counting with ${counter}`);
    },

    count: async () =>
      console.log(`${name}: count = ${await E(counter).inc()}`),
  });
}
