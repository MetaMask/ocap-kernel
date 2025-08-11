import '@ocap/test-utils/mock-endoify';
import type { Config } from 'ollama';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { makeOriginRestrictedFetch } from './fetch.ts';

describe('makeOriginRestrictedFetch', () => {
  const mockHost = 'http://localhost:8080';
  const mockConfig: Config = { host: mockHost };

  const mockResponse = {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ success: true }),
  };

  let originalFetch: typeof fetch;
  let restrictedFetch: typeof fetch;
  let hardenSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    hardenSpy = vi.spyOn(global, 'harden');
    originalFetch = global.fetch;
    vi.spyOn(global, 'fetch').mockImplementation();
    restrictedFetch = makeOriginRestrictedFetch(mockConfig);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('origin validation', () => {
    it.each([
      ['root', []],
      ['with path segment', ['test']],
      ['with query parameters', ['test', '?foo=bar']],
      ['with multiple path segments', ['test', 'test', '?foo=bar']],
    ])(
      'should allow requests to the configured host with different paths: %s',
      async (_case, path: string[]) => {
        const url = [mockHost, ...path].join('/');

        await restrictedFetch(url);

        expect(global.fetch).toHaveBeenCalledWith(url);
      },
    );

    it.each([
      ['wrong origin', 'http://malicious.com'],
      ['subdomain', 'http://api.localhost:8080'],
      ['different port', 'http://localhost:11434'],
      ['different protocol', 'https://localhost:8080'],
    ])(
      'should throw error for unauthorized requests: %s',
      async (_case, origin: string) => {
        assert(origin !== mockHost, 'test of test');
        const url = `${origin}/test/test`;

        await expect(restrictedFetch(url)).rejects.toThrow(
          `Invalid origin: ${origin}, expected: ${mockHost}`,
        );

        expect(global.fetch).not.toHaveBeenCalled();
      },
    );
  });

  describe('fetch behavior', () => {
    it('should pass through fetch response', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse,
      );
      const url = `${mockHost}/api/generate`;

      const result = await restrictedFetch(url);

      expect(result).toBe(mockResponse);
    });

    it('should handle fetch errors', async () => {
      const errorResponse = new Error('Network error');
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        errorResponse,
      );

      const url = `${mockHost}/api/generate`;

      await expect(restrictedFetch(url)).rejects.toThrow('Network error');
    });

    it('should handle multiple arguments correctly', async () => {
      const url = `${mockHost}/api/generate`;
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      };

      await restrictedFetch(url, options);

      expect(global.fetch).toHaveBeenCalledWith(url, options);
    });

    it('should handle Request objects correctly', async () => {
      const url = `${mockHost}/api/generate`;
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const request = new Request(url);

      await restrictedFetch(request);

      expect(global.fetch).toHaveBeenCalledWith(request);
    });
  });

  describe('hardening', () => {
    it('should return a hardened function', () => {
      // The mock harden implementation is (x) => x.
      expect(hardenSpy).toHaveBeenCalledWith(restrictedFetch);
    });
  });
});
