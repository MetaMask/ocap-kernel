import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

/**
 * Build function for the LLM test vat.
 *
 * @param {unknown} _vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, _baggage) {
  const { verbose, users } = parameters;

  const logger = {
    log: console.log,
    debug: verbose ? console.debug : () => {},
    error: console.error,
  };

  const makeInitUser = (vats) => async (user) => {
    logger.debug('boot.initUser:user', user);
    const response = await E(vats[user]).init(
      vats[`${user}.llm`],
      vats[`${user}.vectorStore`],
    );
    logger.debug('boot.initUser:response', response);
  };

  const displayWithBanner = (title, content) => {
    const banner = '---';
    logger.log(
      ['', banner, `${title.toUpperCase()}: ${content}`, banner, ''].join('\n'),
    );
  };

  const showUserMessage = (sender, receiver, content) => {
    displayWithBanner(`${sender}->${receiver}`, content);
  };

  return Far('root', {
    async bootstrap(vats) {
      displayWithBanner('demo', 'Bootstrapping');

      console.time('bootstrap');
      await Promise.all(users.map(makeInitUser(vats)));
      console.timeEnd('bootstrap');

      displayWithBanner('demo', 'Initialized');

      const interactWithBob = async (user) => {
        let whatUserSaid = 'What is the "confused deputy problem"?';

        showUserMessage(user, 'bob', whatUserSaid);

        console.time(`bob:${user}`);
        let whatBobSaid = await E(vats.bob).message(user, whatUserSaid);
        await Promise.resolve();
        console.timeEnd(`bob:${user}`);

        showUserMessage('bob', user, whatBobSaid);

        whatUserSaid = 'When does Consensys IPO?';

        showUserMessage(user, 'bob', whatUserSaid);

        console.time(`bob:${user}`);
        whatBobSaid = await E(vats.bob).message(user, whatUserSaid);
        await Promise.resolve();
        console.timeEnd(`bob:${user}`);

        showUserMessage('bob', user, whatBobSaid);
      };

      await Promise.all([interactWithBob('alice'), interactWithBob('eve')]);

      displayWithBanner('demo', 'Complete');
    },
  });
}
