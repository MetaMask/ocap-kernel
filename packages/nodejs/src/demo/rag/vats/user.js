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
export function buildRootObject(_vatPowers, parameters, _baggage) {
  const prompt = parameters?.prompt ?? `Say hello.`;
  const { verbose } = parameters;

  return Far('root', {
    async bootstrap(vats) {
      if (verbose) {
        console.log('Bootstrap')
      }
      console.log([
        '', 
        '-----\nUSER:\n-----',
        prompt,
        '-----',
        '',
      ].join('\n\n'));
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
