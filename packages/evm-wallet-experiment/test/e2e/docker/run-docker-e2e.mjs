/* eslint-disable n/no-process-exit, n/no-sync */
/**
 * Host-side launcher for Docker E2E tests.
 *
 * Runs `docker compose up` with the test configuration. Intended to be
 * invoked from the developer's machine (not inside a container).
 *
 * Usage:
 *   yarn workspace @ocap/evm-wallet-experiment test:e2e:docker
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const composePath = path.resolve(thisDir, '../../../docker/docker-compose.yml');

console.log('Starting Docker E2E tests...');
console.log(`Compose file: ${composePath}\n`);

// CI uses Ollama: proxy forwards to the ollama container, away uses Ollama API.
/* eslint-disable n/no-process-env */
const env = {
  ...process.env,
  LLM_UPSTREAM: 'http://ollama:11434',
  LLM_BASE_URL: 'http://llm:11434',
  LLM_MODEL: 'qwen2.5:0.5b',
  LLM_API_TYPE: 'ollama',
};

try {
  execSync(
    `docker compose -f ${composePath} --profile test --profile ollama up --build --abort-on-container-exit --exit-code-from test`,
    { stdio: 'inherit', env },
  );
} catch (error) {
  // execSync throws on non-zero exit code
  process.exit(error.status ?? 1);
}
