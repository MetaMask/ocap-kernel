import { E, Far } from '@endo/far';
// eslint-disable-next-line import-x/no-unresolved
import { makeEventualIterator } from '@metamask/streams/vat';

/**
 * Build the root object for a synthetic user.
 *
 * @param {*} _ - Unused.
 * @param {*} parameters - The parameters to use to build the root object.
 * @param {string} parameters.name - The name of the user.
 * @param {string} parameters.prompt - The prompt the user gives to the LLM.
 *
 * @returns {object} The root object.
 */
export function buildRootObject(_, { name, prompt }) {
  let llm;
  return Far(`user:${name}`, {
    bootstrap: async ({ ollama }, _services) => {
      console.log('Bootstrapping user');
      llm = await E(ollama).makeLlm();
      const responseStream = makeEventualIterator(
        await E(llm).generate(prompt),
      );
      let response = '';
      for await (const chunk of responseStream) {
        response += chunk.response;
        console.log(chunk.response);
      }
      return response;
    },
  });
}
