import { fetchMock } from '@ocap/repo-tools/test-utils/fetch-mock';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { capabilityFactory } from './nodejs.ts';
import type { FetchConfig } from './types.ts';
import { createMockResponse } from '../../../test/utils.ts';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('fetch nodejs capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('capabilityFactory', () => {
    it.each([
      {
        name: 'without host restrictions',
        config: {},
        input: 'file:///path/to/file.txt',
      },
      {
        name: 'with host restrictions',
        config: { allowedHosts: ['example.test'] },
        input: 'file:///path/to/file.txt',
      },
      {
        name: 'with Request objects',
        config: {},
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        input: new Request('file:///path/to/file.txt'),
      },
      {
        name: 'with URL objects',
        config: {},
        input: new URL('file:///path/to/file.txt'),
      },
    ])('handles file:// URLs $name', async ({ config, input }) => {
      const fileContents = 'file contents';
      vi.mocked(readFile).mockResolvedValue(fileContents);

      const fetchCapability = capabilityFactory(config, {
        fromFetch: fetchMock,
      });

      const result = await fetchCapability(input);

      expect(readFile).toHaveBeenCalledWith('/path/to/file.txt', 'utf8');
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      expect(result).toBeInstanceOf(Response);
      expect(await result.text()).toBe(fileContents);
      expect(fetchMock).not.toHaveBeenCalled(); // Should not call global fetch for file:// URLs
    });

    it('uses provided fromFetch when specified', async () => {
      const mockResponse = createMockResponse();
      const customFetch = vi.fn().mockResolvedValue(mockResponse);

      const config: FetchConfig = { allowedHosts: ['example.test'] };
      const fetchCapability = capabilityFactory(config, {
        fromFetch: customFetch,
      });

      await fetchCapability('https://example.test/path');

      expect(customFetch).toHaveBeenCalledWith('https://example.test/path');
      expect(fetchMock).not.toHaveBeenCalled(); // Should use custom fetch instead
    });

    it.each([
      {
        name: 'not provided',
        factory: () => capabilityFactory({ allowedHosts: ['example.test'] }),
      },
      {
        name: 'undefined in options',
        factory: () =>
          capabilityFactory(
            { allowedHosts: ['example.test'] },
            { fromFetch: undefined as never },
          ),
      },
    ])('throws error when fromFetch is $name', ({ factory }) => {
      expect(() => factory()).toThrow(
        'Must provide explicit fromFetch capability',
      );
    });
  });
});
