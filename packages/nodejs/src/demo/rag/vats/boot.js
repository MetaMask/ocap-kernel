import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

import { makeLogger } from '../../../../dist/demo/logger.mjs';
import { makeInitUser } from '../../../../dist/demo/rag/user.mjs';

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

  const logger = makeLogger({ label: 'boot', verbose });

  const displayWithBanner = (title, content) => {
    const sep = ''.padStart(title.length, '-');
    logger.log(
      ['', sep, `${title.toUpperCase()}: ${content}`, sep, ''].join('\n'),
    );
  };

  const showUserMessage = (sender, receiver, content) =>
    displayWithBanner(`${sender}->${receiver}`, content);
  const display = (content) => displayWithBanner('demo', content);

  const doRag = async (vats) => {
    display('Bootstrapping');

    console.time('bootstrap');
    const initUser = makeInitUser(vats, logger);
    await Promise.all(
      users.map((user) =>
        initUser(
          user,
          users.filter((peer) => peer !== user),
        ),
      ),
    );
    console.timeEnd('bootstrap');

    display('Initialized');

    // Setup
    // -----

    // Agents:

    // Alice has agent xAlice
    // Bob has agent xBob
    // Eve has agent xEve

    // Trust Matrix
    // T : ( i has T_ij trust for j )

    //        A   B  E
    //     A  --  1  0
    //     B  .7  -  0
    //     E  .9  1  -

    // Current Script
    // --------------

    // xAlice and xEve both ask xBob for public but specialized information
    // xBob responds to both helpfully, using the RAG capability
    // xAlice and xEve both ask xBob for private information
    // xBob responds to xAlice with the information because Bob trusts Alice
    // xBob responds to xEve with ignorance because Bob does not trust Eve

    // Next Script
    // -----------

    // xAlice asks xBob "/wen ConsenSys IPO?"
    // xBob doesn't know so he asks xCarol
    // Carol trusts Bob, so xCarol sends xBob the document by Cyber J.O.E. 9000
    // xBob process the doc and, because Bob trusts Alice, tells xAlice Nov 1st
    // xEve asks xBob "/wen ConsenSys IPO?"
    // Bob doesn't trust Eve, so xBob answers with ignorance

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

    display('Complete');
  };

  return Far('root', {
    async bootstrap(vats) {
      await doRag(vats);
    },
  });
}
