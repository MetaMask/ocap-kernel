import { makeFarGenerator } from '@metamask/streams/vat';
import type { Config as OllamaConfig, Message as ChatMessage } from 'ollama';
import { Ollama } from 'ollama/browser';

const defaultConfig = {
  model: 'llama3.2:latest',
  baseUrl: 'http://localhost:11434',
};

export type Llm = Awaited<ReturnType<typeof makeLlm>>;

/**
 * Connect to a local LLM instance.
 *
 * @param config - The configuration for the LLM.
 * @returns An LLM instance.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function makeLlm(config: Partial<OllamaConfig> = {}) {
  const ollamaConfig = { ...defaultConfig, ...config };
  const ollama = new Ollama(ollamaConfig);
  const { model } = ollamaConfig;
  // await ollama.pull({ model });

  /**
   * Generate a response from the LLM.
   *
   * @param prompt - The prompt to generate a response for.
   * @returns An iterator that yields the response.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const generate = async (prompt: string) => {
    const response = await ollama.generate({ model, prompt, stream: true });
    const iterator = response[Symbol.asyncIterator]();
    return makeFarGenerator(iterator);
  };

  /**
   * Chat with the LLM.
   *
   * @param messages - The messages to chat with.
   * @returns An iterator that yields the response.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const chat = async (messages: ChatMessage[]) => {
    const response = await ollama.chat({ model, messages, stream: true });
    const iterator = response[Symbol.asyncIterator]();
    return makeFarGenerator(iterator);
  };

  return {
    generate,
    chat,
  };
}
