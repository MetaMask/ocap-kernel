import { Far } from '@endo/marshal';

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

  let content;

  const prompt = parameters?.prompt ?? `Say hello, ${model}.`;

  return Far('root', {
    async bootstrap(vats) {
      console.log('bootstrap', { model, prompt });
      const ollama = (await import('ollama')).default;
      await ollama.pull({
        model,
      });
      const response = await ollama.chat({
        model,
        messages: [{ role: 'admin', content: prompt }],
      });
      content = response.message;
    },
    async chat() {
      return content;
    },
  });
}
