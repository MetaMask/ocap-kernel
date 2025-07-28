import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

/**
 * Build function for generic test vat.
 *
 * @param {unknown} vatPowers - Special powers granted to this vat.
 * @param {unknown} vatPowers.llm - An llm service.
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject({ llm }, parameters, _baggage) {
  const name = parameters?.name ?? 'anonymous';
  console.log(`buildRootObject "${name}"`);
  return Far('root', {
    async bootstrap(vats) {
      console.log(`vat ${name} is bootstrap`);
      const pb = E(vats.bob).hello(name);
      const pc = E(vats.carol).hello(name);
      console.log(`vat ${name} got "hello" answer from Bob: '${await pb}'`);
      console.log(`vat ${name} got "hello" answer from Carol: '${await pc}'`);
    },
    hello(from) {
      const message = `vat ${name} got "hello" from ${from}`;
      console.log(message);
      return message;
    },
    makeInstance: (archetype = 'fast') => llm.makeInstance({ archetype }),
  });
}
