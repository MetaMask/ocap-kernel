import { E, Far } from '@endo/far';
// ESLint's import-x/no-unresolved rule with commonjs:false doesn't support subpath exports
// eslint-disable-next-line import-x/no-unresolved
import { makeEventualIterator } from '@metamask/streams/vat';
// eslint-disable-next-line import-x/no-unresolved
import { makeLlmService } from '@ocap/agents';
import { makeOllamaBrowserLlmProvider } from '@ocap/agents/llm-provider/ollama-browser';
// eslint-disable-next-line import-x/no-unresolved
import { Ollama } from 'ollama/browser';

const ollama = new Ollama();

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
    bootstrap: async () => {
      const llmProvider = makeOllamaBrowserLlmProvider(ollama);
      const llmService = makeLlmService(llmProvider);
      console.log(
        `Bootstrapping user with llmService ${JSON.stringify(llmService)}`,
      );
      llm = await E(llmService).makeInstance({ archetype: 'fast' });
      console.log('llm is', llm);
      const responseStream = makeEventualIterator(
        await E(llm).generate(prompt),
      );
      let response = '';
      for await (const chunk of responseStream) {
        response += chunk;
        console.log(chunk);
      }
      return response;
    },
  });
}
