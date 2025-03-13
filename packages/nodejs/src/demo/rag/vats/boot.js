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

    // Script
    // ------

    // xAlice asks xBob "/wen ConsenSys IPO?"
    // xBob doesn't know so he asks xCarol
    // Carol trusts Bob, so xCarol sends xBob the document by Cyber J.O.E. 9000
    // xBob process the doc and, because Bob trusts Alice, tells xAlice Nov 1st
    // xEve asks xBob "/wen ConsenSys IPO?"
    // Bob doesn't trust Eve, so xBob answers with ignorance

    const askBob = async (user, message) => {
      showUserMessage(user, 'bob', message);
      const bobsResponse = await E(vats.bob).message(user, message);
      showUserMessage('bob', user, bobsResponse);
    };

    const firstQuestion = 'When will ConsenSys IPO?';
    display(
      "Alice asks Bob about a private matter, and Bob doesn't know the answer.",
    );
    await askBob('alice', firstQuestion);
    display(
      "Similarly, Eve asks Bob about a private matter, and Bob doesn't know.",
    );
    await askBob('eve', firstQuestion);

    display("Carol augments Bob's document view for Alice's use.");
    await E(vats.bob).augmentKnowledge('alice', [
      E(vats.carol).getPeerDocumentView('bob'),
    ]);

    const secondQuestion = 'Any news on the ConsenSys IPO?';
    display(
      'Alice asks Bob about a private matter once more, and this time, Bob knows and shares the answer!',
    );
    await askBob('alice', secondQuestion);
    display(
      'Eve asks Bob again, but as far as she can tell, Bob is just as oblivious as before.',
    );
    await askBob('eve', secondQuestion);

    display('Complete');
  };

  return Far('root', {
    async bootstrap(vats) {
      await doRag(vats);
    },
  });
}
