/* global harden */
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

/**
 * Build function for generic test vat.
 *
 * @param {unknown} vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(vatPowers, parameters, baggage) {
  const name = parameters?.name ?? 'anonymous';
  const logger = vatPowers.logger.subLogger({ tags: ['test'] });
  const tlog = (message) => logger.log(`${name}: ${message}`);

  /**
   * Print a message to the log.
   *
   * @param {string} message - The message to print.
   */
  function log(message) {
    console.log(`${name}: ${message}`);
  }

  log(`buildRootObject`);

  let startCount;
  if (baggage.has('name')) {
    const savedName = baggage.get('name');
    tlog(`saved name is ${savedName}`);

    startCount = baggage.get('startCount') + 1;
    baggage.set('startCount', startCount);
  } else {
    baggage.init('name', name);
    tlog(`saving name`);

    baggage.init('startCount', 1);
    startCount = 1;
  }
  tlog(`start count: ${startCount}`);

  const me = Far('root', {
    async bootstrap(vats) {
      tlog(`bootstrap()`);
      // Explanation for the following bit of gymnastics: we'd like to save
      // `vats` itself in the baggage, but we can't because the entry for our
      // own root is a local reference and thus not durable, and we can't remove
      // this entry from `vats` directly because, being a parameter object, it
      // arrived hardened.  So instead we have to copy it sans the unwritable element.
      const writeVats = {};
      for (const [prop, value] of Object.entries(vats)) {
        if (value !== me) {
          writeVats[prop] = value;
        }
      }
      baggage.init('vats', harden(writeVats));

      const pIntroB = E(vats.bob).intro(me);
      const pIntroC = E(vats.carol).intro(me);
      const pGreetB = E(vats.bob).greet(`hello from ${name}`);
      const pGreetC = E(vats.carol).greet(`hello from ${name}`);
      const results = await Promise.all([pIntroB, pIntroC, pGreetB, pGreetC]);
      const [, , greetB, greetC] = results;
      tlog(`Bob answers greeting: '${greetB}'`);
      tlog(`Carol answers greeting: '${greetC}'`);
      tlog(`end bootstrap`);
      await E(vats.bob).loopback();
      return `bootstrap ${name}`;
    },
    intro(bootVat) {
      tlog(`intro()`);
      baggage.init('bootVat', bootVat);
    },
    greet(greeting) {
      tlog(`greet('${greeting}')`);
      return `${name} returns your greeting '${greeting}'`;
    },
    async resume() {
      tlog(`resume()`);
      if (baggage.has('vats')) {
        // I am the bootstrap vat
        tlog(`resumed vat is bootstrap`);
        const vats = baggage.get('vats');
        const pGreetB = E(vats.bob).greet(`hello again from ${name}`);
        const pGreetC = E(vats.carol).greet(`hello again from ${name}`);
        const [greetB, greetC] = await Promise.all([pGreetB, pGreetC]);
        tlog(`Bob answers greeting: '${greetB}'`);
        tlog(`Carol answers greeting: '${greetC}'`);
        await E(vats.bob).loopback();
      }
      if (baggage.has('bootVat')) {
        // I am Bob or Carol
        tlog(`resumed vat is not bootstrap`);
        const bootVat = baggage.get('bootVat');
        const greetBack = await E(bootVat).greet(`hello boot vat from ${name}`);
        tlog(`boot vat returns greeting with '${greetBack}'`);
        await E(bootVat).loopback();
      }
      tlog(`end resume`);
      return `resume ${name}`;
    },
    loopback() {
      return undefined;
    },
  });
  return me;
}
