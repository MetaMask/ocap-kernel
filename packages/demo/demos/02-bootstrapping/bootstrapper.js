import { E, Far } from '@endo/far';

export function buildRootObject() {
  return Far('root', {
    /**
     * Bootstrapping takes place after every vat's root object has been built.
     * This is the first opportunity vats in the cluster have to contact one
     * another.
     *
     * @param {Record<string, object>} vats - A record of root objects, named
     * according to their entries in the cluster config file, e.g.
     * @param {object} vats.alice - Alice's root object.
     * @param {object} vats.bob - Bob's root object.
     */
    async bootstrap({ alice, bob }) {
      // Say our hellos.
      await E(alice).hello().then(console.log);
      await E(bob).hello().then(console.log);

      // Then our goodbyes.
      await E(alice).goodbye().then(console.log);
      await E(bob).goodbye().then(console.log);
    },
  });
}
