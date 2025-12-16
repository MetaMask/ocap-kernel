import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import { makeQueueService } from '@ocap/kernel-language-model-service/queue';
import { makeExoGenerator } from '@ocap/remote-iterables';

/**
 * An envatted @ocap/kernel-language-model-service package.
 *
 * @returns {object} A QueueLanguageModelService instance.
 */
export function buildRootObject() {
  const queueService = makeQueueService();
  return makeDefaultExo('root', {
    async makeInstance(config) {
      const model = await queueService.makeInstance(config);
      return makeDefaultExo('queueLanguageModel', {
        async getInfo() {
          return model.getInfo();
        },
        async load() {
          return model.load();
        },
        async unload() {
          return model.unload();
        },
        async sample(prompt) {
          const result = await model.sample(prompt);
          // Convert the async iterable stream to an async generator and make it remotable
          const streamGenerator = async function* () {
            for await (const chunk of result.stream) {
              yield chunk;
            }
          };
          const streamRef = makeExoGenerator(streamGenerator());
          // Store abort function for later use
          const abortFn = result.abort;
          // Return a remotable object with getStream and abort as methods
          return makeDefaultExo('sampleResult', {
            getStream() {
              return streamRef;
            },
            async abort() {
              return abortFn();
            },
          });
        },
        push(text) {
          return model.push(text);
        },
      });
    },
  });
}
