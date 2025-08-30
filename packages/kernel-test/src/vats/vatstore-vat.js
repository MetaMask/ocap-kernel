import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for running a test of the vatstore.
 *
 * @param {unknown} _vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} baggage - Root of vat's persistent state.
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, baggage) {
  const name = parameters?.name ?? 'anonymous';
  console.log(`buildRootObject "${name}"`);

  const testKey1 = 'thing';
  const testKey2 = 'goAway';

  return makeDefaultExo('root', {
    async bootstrap(vats) {
      console.log(`vat ${name} is bootstrap`);
      if (!baggage.has(testKey1)) {
        baggage.init(testKey1, 1);
      }
      baggage.init(testKey2, 'now you see me');
      const pb = E(vats.bob).go(name, vats.alice);
      const pc = E(vats.carol).go(name, vats.alice);
      console.log(`vat ${name} got "go" answer from Bob: '${await pb}'`);
      console.log(`vat ${name} got "go" answer from Carol: '${await pc}'`);
      baggage.delete(testKey2);
      await E(vats.bob).loopback();
    },
    bump(bumper) {
      const value = baggage.get(testKey1);
      baggage.set(testKey1, value + 1);
      console.log(`${bumper} bumps ${testKey1} from ${value} to ${value + 1}`);
    },
    go(from, bumpee) {
      const message = `vat ${name} got "go" from ${from}`;
      console.log(message);
      E(bumpee).bump(name);
      return message;
    },
    loopback() {
      return undefined;
    },
  });
}
