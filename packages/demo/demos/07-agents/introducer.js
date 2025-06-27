/**
 * Example 07: Agents.
 * -------------------
 * This example shows two agents, Alice and Bob, who pass control of a dialogue
 * back and forth between them.
 *
 * @see agent.js for the vat that defines the agent.
 * @see cluster.json for the cluster configuration.
 */

import { E, Far } from '@endo/far';

import { nextLine, logMessage } from './dialogue.js';

export function buildRootObject() {
  return Far('root', {
    async bootstrap({ alice, bob }) {
      // This bootstrap routine puts the agents in conversation with each
      // other, allowing them to carry on as if Alice had initiated the
      // conversation independently.
      const [firstMessage] = await nextLine();

      logMessage('Alice', 'Bob', firstMessage);

      // To ensure Alice has a proper view of the dialogue, we update her
      // record to include the first message.
      await E(alice).pushDialogue('Alice', firstMessage);

      // Bob is sent 'reply' - a handle to Alice's message capability.
      // When Bob calls `E(reply).message`, he provides a handle to his own
      // message capability in the arguments. This volley continues until the
      // reply capability is omitted.
      await E(bob).message('Alice', firstMessage, alice);
      // The above line returns a promise that resolves when the dialogue is
      // complete.

      // Now we check that Alice and Bob have the same view of the dialogue.
      const aliceDialogue = await E(alice).getDialogue();
      const bobDialogue = await E(bob).getDialogue();

      // Now we can see that Alice and Bob have the same view of the dialogue.
      const dialoguesEqual = aliceDialogue.every(
        ([who, said], index) =>
          bobDialogue[index][0] === who && bobDialogue[index][1] === said,
      );

      console.log(' ');
      console.log(
        `Alice and Bob have the same view of the dialogue:`,
        dialoguesEqual,
      );
      console.log(' ');
    },
  });
}
