import { Ollama } from "ollama";

/**
 * Returns a promise that resolves when the ollama service is running,
 * or rejects if the API is unreachable.
 */
export const ollamaOnline = async (host: string) => {
  const response = await (await fetch(host)).text();
  const expectation = 'Ollama is running';
  if (response !== expectation) {
    throw new Error('Ollama not running', { cause: { host, response } });
  }
};

/**
 * Ensure the ollama server is running and return a connection to it.
 * 
 * @param param0 - The args.
 * @param param0.host - The url to reach the local ollama server.
 * @returns An Ollama API object.
 * @throws If the ollama server cannot be reached at the provided host url.
 */
export default async function makeOllama({ host } : {host: string}) {
  await ollamaOnline(host);
  return new Ollama({ host });
}
