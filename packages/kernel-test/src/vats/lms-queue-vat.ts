import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import { makeQueueService } from '@ocap/kernel-language-model-service/test-utils';
import { makeExoGenerator } from '@ocap/remote-iterables';

type QueueModel = {
  getInfo: () => unknown;
  load: () => Promise<void>;
  unload: () => Promise<void>;
  sample: (prompt: string) => Promise<{
    stream: AsyncIterable<unknown>;
    abort: () => void;
  }>;
  push: (text: string) => void;
};

/**
 * An envatted @ocap/kernel-language-model-service package.
 *
 * @returns A QueueLanguageModelService instance.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject() {
  const queueService = makeQueueService();
  return makeDefaultExo('root', {
    async makeInstance(config: unknown) {
      const model = (await queueService.makeInstance(config)) as QueueModel;
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
        async sample(prompt: string) {
          const result = await model.sample(prompt);
          // Convert the async iterable stream to an async generator and make it remotable
          const streamGenerator = async function* (): AsyncGenerator<unknown> {
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
        push(text: string) {
          return model.push(text);
        },
      });
    },
  });
}
