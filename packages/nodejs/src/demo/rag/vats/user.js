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
export function buildRootObject(vatPowers, parameters, _baggage) {
  const prompt = parameters?.prompt ?? `Say hello.`;
  const { verbose, docs } = parameters;

  return Far('root', {
    async bootstrap(vats) {
      if (verbose) {
        console.log('Bootstrap')
      }

      console.log('initializing:', 'wiki');
      await E(vats.wiki).initModels();
      await E(vats.wiki).addDocuments(docs);
      console.log('initialized:', 'wiki')

      console.log([
        '', 
        '-----\nUSER:\n-----',
        prompt,
        '-----',
        '',
      ].join('\n\n'));

      await E(vats.ollama).setWiki(vats.wiki);
      const response = E(vats.ollama).chat(prompt);

      console.log([
        '',
        '----\nLLM:\n----',
        await response,
        '----',
        '',
      ].join('\n\n'));

    },
  });
}
