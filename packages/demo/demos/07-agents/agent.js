/**
 * Example 04: Introductions.
 * --------------------------
 * This example shows how to introduce two vats to one another. This vat
 * is instantiated multiple times under different names.
 *
 * @see cluster.json for the mapping of vat names to bundles.
 * @see agent.js for the vat that introduces two vats to one another.
 */
import { E, Far } from '@endo/far';

import { nextLine, logMessage } from './dialogue.js';
import makeRandom from './random.js';

export function buildRootObject(_, params) {
  const { name = 'unknown', dialogue = [], seed = 1 } = params;
  const random = makeRandom(seed);

  const pushDialogue = (sender, content) => dialogue.push([sender, content]);

  async function message(sender, content, reply = false) {
    pushDialogue(sender, content);

    if (!reply) {
      return;
    }

    const [response, goOn] = await nextLine(content, random.choice);

    pushDialogue(name, response);

    logMessage(name, sender, response);

    await E(reply).message(name, response, goOn && Far('reply', { message }));
  }

  return Far('root', { message, pushDialogue, getDialogue: () => dialogue });
}
