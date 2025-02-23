import { Far } from '@endo/marshal';
import { makePipe } from '@endo/stream';
import { makeLogger } from '../../../../dist/demo/logger.mjs';

// The default LLM model to use.
const DEFAULT_MODEL = 'deepseek-r1:7b';

const [thinkStart, thinkEnd] = ['<think>', '</think>'];

const parseResponse = (response) => {
  const [thought, speech] = response.message.content
    .substring(thinkStart.length)
    .split(thinkEnd)
    .map((content) => content.trim());
  return { thought, speech };
};

/**
 * Split deepseek generated output into thought and speech async generators.
 *
 * Assumes that the string represent the beginning and end of thought are
 * always* generated as complete tokens, and *never* partially as strings.
 *
 * @param {*} response - An async generator yielding a deepseek token stream.
 * @returns An object with async generator properties 'thought' and 'speech'.
 */
const parseResponseStream = (response) => {
  const [thought, thoughtWriter] = makePipe();
  const [speech, speechWriter] = makePipe();

  const writeToThought = (content) => thoughtWriter.next(content);
  const writeToSpeech = (content) => speechWriter.next(content);

  const producer = async () => {
    const [INITIALIZING, THINKING, SPEAKING] = ['INIT', 'THINK', 'SPEAK'];
    let state = INITIALIZING;
    let accumulatedContent = '';
    for await (const part of response) {
      accumulatedContent += part.message.content;
      switch (state) {
        case INITIALIZING:
          if (accumulatedContent.startsWith(thinkStart)) {
            accumulatedContent = accumulatedContent.substring(
              thinkStart.length,
            );
            state = THINKING;
            writeToThought(accumulatedContent);
          }
          break;
        case THINKING:
          if (accumulatedContent.includes(thinkEnd)) {
            const [head, tail] = accumulatedContent.split(thinkEnd);
            writeToThought(head);
            state = SPEAKING;
            writeToSpeech(tail);
          }
          break;
        case SPEAKING:
          writeToSpeech(part.message.content);
          break;
        default:
          throw new Error(
            'Reached unexpected state during deepseek stream parse',
            { cause: { state, accumulatedContent } },
          );
      }
    }
  };

  producer().catch((reason) => {
    thoughtWriter.throw(reason);
    speechWriter.throw(reason);
  });

  return { thought, speech };
};

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
  const { name, verbose } = parameters;
  const { ollama } = vatPowers;

  const logger = makeLogger({ label: `[${name}.llm]`, verbose });

  const logThoughts = async (thoughts, stream, log) => {
    if (stream) {
      for await (const thought of thoughts) {
        log(thought);
      }
    } else {
      log(await thoughts);
    }
  };

  const hasCtxSuffix = model.match(/-[0-9]+((\.[0-9]+))?k$/u) !== null;
  const mapCtxSuffix = (suffix) => {
    switch (suffix) {
      case '8k':
        return 8096;
      default:
        throw new Error(`Unrecognized context window suffix ${suffix}.`);
    }
  };
  return Far('root', {
    async init() {
      const toReturn = [];
      const modelSplit = model.split('-');

      const toPull = hasCtxSuffix
        ? modelSplit.slice(0, modelSplit.length - 1).join('-')
        : model;

      logger.debug(
        'pulling:',
        JSON.stringify({
          modelSplit,
          toPull,
          hasCtxSuffix,
        }),
      );
      toReturn.push(await ollama.pull({ model: toPull }));

      if (hasCtxSuffix) {
        toReturn.push(
          await ollama.create({
            model,
            from: toPull,
            parameters: {
              num_ctx: mapCtxSuffix(modelSplit.at(modelSplit.length - 1)),
            },
          }),
        );
      }

      return toReturn;
    },
    async generate(prompt, stream, raw = false) {
      const result = await ollama.generate({
        model,
        prompt,
        stream,
        raw,
      });
      return Far('response', { response: result.response });
    },
    async chat(messages, stream) {
      logger.debug('chat:messages', messages);
      const response = ollama.chat({ model, messages, stream });
      const { thought, speech } = stream
        ? parseResponseStream(response)
        : parseResponse(await response);

      logThoughts(thought, stream, logger.debug).catch((reason) => {
        logger.error(thought);
        speech.throw(reason);
      });

      const toReturn = stream ? Far('speech', speech) : speech;

      return toReturn;
    },
  });
}
