import { E, Far } from '@endo/far';

export function buildRootObject(_, { name = 'Bob' }) {
  let cap = null;

  return Far('root', {
    getName: () => name,

    introduce: async (whom) => `${name}~>${await E((cap = whom)).getName()}`,

    makeCounter: () => {
      const counter = E(cap).makeCounter();
      return Far(`${name}'s counter`, {
        inc: () => E(counter).inc(),
        get: () => E(counter).get(),
      });
    },

    terminate: () => {
      for (;;) {
        /* this ends the vat */
      }
    },
  });
}
