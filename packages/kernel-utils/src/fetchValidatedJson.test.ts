import { object, string } from '@metamask/superstruct';
import { fetchMock } from '@ocap/repo-tools/test-utils';
import { describe, it, expect } from 'vitest';

import { fetchValidatedJson } from './fetchValidatedJson.ts';

describe('fetchValidatedJson', () => {
  const TestConfigStruct = object({
    name: string(),
  });

  it('fetches and validates JSON successfully', async () => {
    const mockConfig = {
      name: 'test',
    };

    fetchMock.mockResponseOnce(JSON.stringify(mockConfig));

    const result = await fetchValidatedJson(
      'http://test.url',
      TestConfigStruct,
    );
    expect(result).toStrictEqual(mockConfig);
    expect(fetchMock).toHaveBeenCalledWith('http://test.url');
  });

  it('throws on fetch failure', async () => {
    fetchMock.mockResponseOnce('', { status: 404, statusText: 'Not Found' });

    await expect(
      fetchValidatedJson('http://test.url', TestConfigStruct),
    ).rejects.toThrow('Failed to fetch config: 404 Not Found');
  });

  it('throws on invalid JSON', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ invalid: 'config' }));

    await expect(
      fetchValidatedJson('http://test.url', TestConfigStruct),
    ).rejects.toThrow('Failed to load config from http://test.url');
  });
});
