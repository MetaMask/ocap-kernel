import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

// The default LLM model to use.
const DEFAULT_MODEL = 'deepseek-r1:7b';

const parseResponse = (response) => {
  const thinkTokens = ['<think>', '</think>'];
  const trimmed = response.message.content.startsWith('<think>')
    ? response.message.content.substring(thinkTokens[0].length)
    : response.message.content;
  const [thought, speech] = trimmed.split(thinkTokens[1]);
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
  let thisWiki;

  console.debug(`buildRootObject "${JSON.stringify({ model, ollama })}"`);

  return Far('root', {
    setWiki(wiki) {
      thisWiki = wiki;
    },
    async chat(prompt) {
      if (verbose) {  
        console.log('chat');
        console.time('llm');
      }
      const docs = thisWiki
        ? await E(thisWiki).retrieve(prompt)
        : [];

      console.log('RETRIEVED DOCS', docs);

      const messages = [
        {
          role: 'user',
          content: [
            'You may find some or all of the following information helpful when responding to my request.',
            ...docs.map(({ pageContent }) => pageContent)
          ].join('\n\n')
        },
        { role: 'user', content: prompt },
      ];

      console.log('\n--------');
      console.log('MESSAGES')
      console.log(JSON.stringify(messages, null, 2));
      console.log('--------\n');

      const response = await ollama.chat({
        model: `${model}-8k`,
        messages,
      });
      const { thought, speech } = parseResponse(response);

      console.log('\n--------');
      console.log('THOUGHTS');
      console.log(JSON.stringify(thought.split('\n\n'), null, 2));
      console.log('--------\n');

      if (verbose) {
        console.timeEnd('llm');
        console.debug('Thought:', thought);
      }
      return speech;
    },
  });
}
