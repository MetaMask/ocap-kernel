import { Far } from '@endo/marshal';

let makeOllama;
try {
  const ollama = import('ollama');
  makeOllama = ollama.then((lib) => () => new lib.Ollama());
} catch (problem) {
  console.error(problem);
  makeOllama = async () => () => ({
    list: async () => {
      console.debug('mock list called');
      return [];
    },
  });
}

/**
 * Build function for generic test vat.
 *
 * @param {unknown} _vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, _baggage) {
  const name = parameters?.name ?? 'anonymous';
  console.log(`buildRootObject "${name}"`);

  return Far('root', {
    async bootstrap() {
      const ollama = (await makeOllama)();
      const models = await ollama.list();
      console.log('models:', models);
    },
  });
}
