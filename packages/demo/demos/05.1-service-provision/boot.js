import { E, Far } from '@endo/far';

export function buildRootObject() {
  return Far('root', {
    async bootstrap({ alice, bob, carol, charlie }) {
      console.log('bootstrapping');
      // We can perform introductions in parallel.
      await Promise.all([
        E(alice).introduceAggregator(bob),
        E(bob).introduceProvider(E(carol).getServiceDescriptor()),
        E(bob).introduceProvider(E(charlie).getServiceDescriptor()),
      ]);
      console.log('introductions complete');
      // Then we have alice request the service.
      await E(alice).run();
    },
  });
}
