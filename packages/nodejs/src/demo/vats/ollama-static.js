import '../../../dist/env/endoify.mjs';
import { Far } from '@endo/marshal';
import { Ollama } from 'ollama';

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
      const ollama = new Ollama();
      const models = await ollama.list();
      console.log('models:', models);
    },
  });
}
