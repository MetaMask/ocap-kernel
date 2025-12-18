import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import { makeEventualIterator } from '@ocap/remote-iterables';

/**
 * A vat that uses a language model service to generate text.
 *
 * @param {object} vatPowers - The powers of the vat.
 * @param {object} vatPowers.logger - The logger of the vat.
 * @param {object} parameters - The parameters of the vat.
 * @param {string} parameters.name - The name of the vat.
 * @returns {object} A default Exo instance.
 */
export function buildRootObject({ logger }, { name = 'anonymous' }) {
  const tlogger = logger.subLogger({ tags: ['test', name] });
  const tlog = (...args) => tlogger.log(...args);
  let languageModel;
  const root = makeDefaultExo('root', {
    async bootstrap({ languageModelService }, _kernelServices) {
      languageModel = await E(languageModelService).makeInstance({
        model: 'test',
      });
      await E(languageModel).push(`My name is ${name}.`);
      const response = await E(root).ask('Hello, what is your name?');
      tlog(`response: ${response}`);
    },
    async ask(prompt) {
      let response = '';
      const sampleResult = await E(languageModel).sample(prompt);
      const stream = await E(sampleResult).getStream();
      const iterator = makeEventualIterator(stream);
      for await (const chunk of iterator) {
        response += chunk.response;
      }
      return response;
    },
  });

  return root;
}
