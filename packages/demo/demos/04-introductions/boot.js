import { E, Far } from '@endo/far';

import { makeFacet } from './facet.js';

export function buildRootObject() {
  const { log } = console;
  return Far('root', {
    bootstrap: async ({ alice, bob }) => {
      log('--- Alice  :  Bob ---');
      // Prior to introduction, Alice cannot contact Bob.
      await E(alice).foo().then(log);
      log(' ');
      log('--- Alice ==> Bob ---');
      // Once Alice receives a reference to Bob, she can call his methods.
      await E(alice).introduce(bob);
      await E(alice).foo().then(log);
      // Even so, Bob still cannot contact Alice.
      await E(bob).foo().then(log);
      log(' ');
      log('--- Alice <=> Bob ---');
      // When we introduce Bob to Alice, we pass a subset of Alice's methods,
      // called a _facet_ of Alice, to Bob.
      // Bob can now call only Alice's 'qux' method.
      await E(bob).introduce(makeFacet(alice, ['qux']));
      // But that method is sufficient to complete Alice's call chain.
      await E(alice).foo().then(log);
    },
  });
}
