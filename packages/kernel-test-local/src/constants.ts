/**
 * Test constants for E2E tests
 */
export const DEFAULT_MODEL = 'llama3.1:latest';
export const TEST_MODELS = ['llama3.1:latest', 'gpt-oss:20b'];

/**
 * Ollama API endpoints
 */
export const OLLAMA_API_BASE = 'http://localhost:11434';
export const OLLAMA_TAGS_ENDPOINT = `${OLLAMA_API_BASE}/api/tags`;

/**
 * Logger tags to ignore, parsed from the LOGGER_IGNORE environment variable.
 */
export const IGNORE_TAGS =
  // eslint-disable-next-line n/no-process-env
  process?.env?.LOGGER_IGNORE?.split(',')?.map((tag) => tag.trim()) ?? [];
