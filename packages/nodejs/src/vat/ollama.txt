import { Far } from '@endo/marshal';
import ollama from 'ollama';

// The default LLM model to use.
const DEFAULT_MODEL = 'deepseek-r1:1.5b';

/**
 * Build function for the LLM test vat.
 *
 * @param {unknown} _vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, _baggage) {
  const model = parameters?.model ?? DEFAULT_MODEL;
  console.log(`[LLM] buildRootObject "${model}"`);

  return Far('root', {
    async bootstrap() {
      await ollama.pull({
        model,
      });
    },
    async chat(prompt) {
      const response = await ollama.chat({
        model,
        messages: [{ role: 'user', content: prompt }],
      });
      const { content } = response.message;
      console.log(content);
      return content;
    },
  });
}
