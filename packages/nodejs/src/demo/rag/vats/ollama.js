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
      const { log, time, timeEnd } = verbose
        ? { ...console }
        : {
          log: () => {},
          time: () => {},
          timeEnd: () => {},
        };

      const bigLog = (title, message) => {
        const banner = title.map(() => '-').join('');
        log(`\n${banner}`);
        log(title);
        log(message);
        log(`${banner}\n`);
      }

      time('llm');

      const docs = thisWiki
        ? await E(thisWiki).retrieve(prompt)
        : [];

      log('RETRIEVED DOCS', docs);

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

      bigLog('MESSAGES', JSON.stringify(messages, null, 2));

      const response = await ollama.chat({
        model: `${model}-8k`,
        messages,
      });
      const { thought, speech } = parseResponse(response);

      bigLog('THOUGHTS', JSON.stringify(thought.split('\n\n'), null, 2));
      
      timeEnd('llm');
      
      return speech;
    },
  });
}
