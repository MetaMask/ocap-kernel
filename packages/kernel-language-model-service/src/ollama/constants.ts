/**
 * Default configuration for Ollama client connections.
 * Points to the standard Ollama server endpoint running on localhost.
 * This is the default endpoint when Ollama is installed and running locally.
 * Note that the argument designated 'host' includes the protocol and port.
 */
export const defaultClientConfig = {
  host: 'http://localhost:11434',
};
