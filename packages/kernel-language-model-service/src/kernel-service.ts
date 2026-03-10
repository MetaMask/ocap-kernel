import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import { makeExoGenerator } from '@ocap/remote-iterables';

import type { LanguageModelService, InstanceConfig } from './types.ts';

/**
 * Canonical service name for the language model service in `ClusterConfig.services`.
 */
export const LANGUAGE_MODEL_SERVICE_NAME = 'languageModelService';

/**
 * Wraps a {@link LanguageModelService} into a remotable kernel service object
 * suitable for passing to `Kernel.make()` or `Kernel.registerKernelServiceObject()`.
 *
 * @param service - The language model service to wrap.
 * @returns An object with `name` and `service` fields for use with the kernel.
 */
export const makeKernelLanguageModelService = (
  service: LanguageModelService<unknown, unknown, unknown>,
): { name: string; service: object } => {
  const exo = makeDefaultExo(LANGUAGE_MODEL_SERVICE_NAME, {
    async makeInstance(config: InstanceConfig<unknown>) {
      const model = await service.makeInstance(config);
      return makeDefaultExo('languageModel', {
        async getInfo() {
          return model.getInfo();
        },
        async load() {
          return model.load();
        },
        async unload() {
          return model.unload();
        },
        async sample(prompt: string, options?: Partial<unknown>) {
          const result = await model.sample(prompt, options);
          const streamGenerator = async function* (): AsyncGenerator<unknown> {
            for await (const chunk of result.stream) {
              yield chunk;
            }
          };
          const streamRef = makeExoGenerator(streamGenerator());
          const abortFn = result.abort;
          return makeDefaultExo('sampleResult', {
            getStream() {
              return streamRef;
            },
            async abort() {
              return abortFn();
            },
          });
        },
      });
    },
  });
  return harden({ name: LANGUAGE_MODEL_SERVICE_NAME, service: exo });
};
