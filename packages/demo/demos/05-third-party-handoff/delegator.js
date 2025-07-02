import { E, Far } from '@endo/far';

export function buildRootObject(_, { name = 'Bob' }) {
  let target = null;

  return Far('root', {
    getName: () => name,

    connectTo: async (whom) => `${name}~>${await E((target = whom)).getName()}`,

    foo: () => E(target).foo(),

    disconnect: () => (target = null),
  });
}
