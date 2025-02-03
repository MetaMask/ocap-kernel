import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

// The default LLM model to use.
const DEFAULT_MODEL = 'deepseek-r1:1.5b';

const parseResponse = (response) => {
  const thinkTokens = ['<think>', '</think>'];
  const [thought, speech] = response.message.content
    .substring(thinkTokens[0].length)
    .split(thinkTokens[1]);
  return {
    thought: thought.trim(),
    speech: speech.trim(),
  };
};

const clip = (content, length = 10) => 
  `${content.substring(0, length)}${content.length > length ? '...' : ''}`;

/**
 * Build function for the LLM test vat.
 *
 * @param {unknown} vatPowers - Special powers granted to this vat.
 * @param {() => Promise<unknown>} vatPowers.ollama - An Ollama instance ready for use.
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state (not used here).
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(vatPowers, parameters, _baggage) {
  const model = parameters?.model ?? DEFAULT_MODEL;
  const { verbose } = parameters;
  const { ollama } = vatPowers;

  console.debug(`buildRootObject "${JSON.stringify({ model, ollama })}"`);

  return Far('root', {
    async chat(prompt) {
      if (verbose) {  
        console.log('chat');
        console.time('llm');
      }
      const response = await ollama.chat({
        model,
        messages: [
          { role: 'user', content: prompt }
        ],
      });
      const { thought, speech } = parseResponse(response);
      if (verbose) {
        console.timeEnd('llm');
        console.debug('Thought:', thought);
      }
      return speech;
    },
  });
}
