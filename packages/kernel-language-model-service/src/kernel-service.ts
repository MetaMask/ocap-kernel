import type {
  ChatParams,
  ChatResult,
  SampleParams,
  SampleResult,
} from './types.ts';

/**
 * Canonical service name for the language model service in `ClusterConfig.services`.
 */
export const LANGUAGE_MODEL_SERVICE_NAME = 'languageModelService';

/**
 * Wraps `chat` and optional `sample` functions into a flat, stateless kernel service object.
 * Use the returned `{ name, service }` with `kernel.registerKernelServiceObject(name, service)`.
 *
 * Return values are plain hardened data — no exos — so they are safely serializable
 * across the kernel marshal boundary.
 *
 * @param chat - Function that performs a chat completion request.
 * @param sample - Optional function that performs a raw token-prediction request.
 *   If not provided, `service.sample()` throws "raw sampling not supported by this backend".
 * @returns An object with `name` and `service` fields for use with the kernel.
 */
export const makeKernelLanguageModelService = (
  chat: (params: ChatParams & { stream?: true & false }) => Promise<ChatResult>,
  sample?: (params: SampleParams) => Promise<SampleResult>,
): { name: string; service: object } => {
  const service = harden({
    async chat(params: ChatParams): Promise<ChatResult> {
      return harden(await chat(params as ChatParams & { stream?: never }));
    },
    async sample(params: SampleParams): Promise<SampleResult> {
      if (!sample) {
        throw new Error('raw sampling not supported by this backend');
      }
      return harden(await sample(params));
    },
  });
  return harden({ name: LANGUAGE_MODEL_SERVICE_NAME, service });
};
