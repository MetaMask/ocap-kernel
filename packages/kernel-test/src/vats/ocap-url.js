import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

/**
 * Build function for vats that will run various tests.
 *
 * @param {object} vatPowers - Special powers granted to this vat.
 * @param {object} vatPowers.logger - The logger for this vat.
 * @returns {*} The root object for the new vat.
 */
export function buildRootObject({ logger }) {
  const { log } = logger.subLogger({ tags: ['test'] });
  let contact;
  return Far('root', {
    async bootstrap({ alice }) {
      contact = Far('contact', {
        // An external actor can send a message to Alice by following an
        // ocap url like "ocap://.../contact?whoAmI=Bob&message=Hello".
        contact: (whoAmI, message) => E(alice).contact(whoAmI, message),
      });
      const ocapUrl = E(alice).makeContactUrl();
      log(`Alice's ocap url: ${await ocapUrl}`);
    },
    // `makeOcapUrl` is an endowment available in global scope.
    // eslint-disable-next-line no-undef
    makeContactUrl: () => makeOcapUrl(contact),
    async contact(sender = 'unknown', message = 'hello') {
      log(`contact from ${sender}: ${message}`);
    },
  });
}
