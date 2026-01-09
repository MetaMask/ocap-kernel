/**
 * Pre-test verification suite that checks:
 *
 * - Ollama service is running and accessible
 * - Required models are available
 *
 * These tests run sequentially and must pass before the main test suite.
 */
import { fetchMock } from '@ocap/repo-tools/test-utils/fetch-mock';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DEFAULT_MODEL,
  OLLAMA_API_BASE,
  OLLAMA_TAGS_ENDPOINT,
} from '../../src/constants.ts';

describe.sequential('test suite', () => {
  beforeAll(() => {
    fetchMock.disableMocks();
  });

  afterAll(() => {
    fetchMock.enableMocks();
  });

  it(`connects to Ollama instance`, async () => {
    const response = await fetch(OLLAMA_API_BASE);
    expect(response.ok).toBe(true);
  });

  it(`can access ${DEFAULT_MODEL} model`, async () => {
    const response = await fetch(OLLAMA_TAGS_ENDPOINT);
    expect(response.ok).toBe(true);

    const data = (await response.json()) as {
      models: { name: string }[];
    };
    expect(data?.models).toBeDefined();
    expect(Array.isArray(data.models)).toBe(true);

    const llamaModel = data.models.find(
      (foundModel: { name: string }) => foundModel.name === DEFAULT_MODEL,
    );
    expect(llamaModel).toBeDefined();
    expect(llamaModel?.name).toBe(DEFAULT_MODEL);
  });
});
