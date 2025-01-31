import { Far } from '@endo/marshal';

// The default LLM model to use.
const DEFAULT_MODEL = 'deepseek-r1:1.5b';

/**
 * Build function for the LLM test vat.
 *
 * @param {unknown} vatPowers - Special powers granted to this vat.
 * @param {() => Promise<unknown>} vatPowers.chat - A method for awaiting chat results from an LLM.
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(vatPowers, parameters, _baggage) {
  const model = parameters?.model ?? DEFAULT_MODEL;
  const prompt = parameters?.prompt ?? `Say hello.`;

  console.log(`[LLM] buildRootObject "${JSON.stringify({model, prompt, vatPowers})}"`);

  const { chat } = vatPowers;

  return Far('root', {
    bootstrap(_) {
      chat({
        model,
        messages: [{ role: 'user', content: prompt }],
      }).then((response) => {
        console.log('response:', response);
        return undefined;
      }).catch((problem) => {
        console.error('problem:', problem);
      });
    },
    hello(from) {
      console.log(`hello, ${from}`);
    },
  });
}
