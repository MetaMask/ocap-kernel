import { Far } from '@endo/far';

import { makeLlm } from '../llm.ts';

/**
 * Build the root object for an ollama vat.
 *
 * @returns {object} The root object.
 */
export async function buildRootObject() {
  return Far('root', {
    makeLlm: async (config) => Far('llm', { ...(await makeLlm(config)) }),
  });
}
