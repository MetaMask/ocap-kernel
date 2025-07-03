import { E, Far } from '@endo/far';

export function buildRootObject(_, { name = 'Bob', handoff }) {
  let cap = null;

  return Far('root', {
    getName: () => name,

    introduce: async (whom) => `${name}~>${await E((cap = whom)).getName()}`,

    makeCounter: () =>
      handoff
        ? E(cap).makeCounter()
        : E(cap)
            .makeCounter()
            .then((counter) =>
              Far(`${name}'s counter`, {
                inc: () => E(counter).inc(),
                get: () => E(counter).get(),
              }),
            ),
  });
}
