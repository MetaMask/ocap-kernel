import '@ocap/test-utils/mock-endoify';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { makeHostRestrictedFetch } from './fetch.ts';

describe('makeHostRestrictedFetch', () => {
  const mockHost = 'localhost:8080';
  const mockUrl = `http://${mockHost}/test/test`;

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
    vi.spyOn(global, 'fetch').mockImplementation(vi.fn());
    restrictedFetch = makeHostRestrictedFetch([mockHost]);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('host validation', () => {
    it.each([
      ['root', []],
      ['with path segment', ['test']],
      ['with query parameters', ['test', '?foo=bar']],
      ['with multiple path segments', ['test', 'test', '?foo=bar']],
    ])(
      'should allow requests to the configured host with different paths: %s',
      async (_case, path: string[]) => {
        const url = ['http:/', mockHost, ...path].join('/');

        await restrictedFetch(url);

        expect(global.fetch).toHaveBeenCalledWith(url);
      },
    );

    it.each([
      ['wrong origin', 'malicious.com'],
      ['subdomain', 'api.localhost:8080'],
      ['different port', 'localhost:11434'],
    ])(
      'should throw error for unauthorized requests: %s',
      async (_case, host: string) => {
        assert(host !== mockHost, 'test of test');
        const url = `http://${host}/test/test`;

        await expect(restrictedFetch(url)).rejects.toThrow(
          `Invalid host: ${host}, expected: ${mockHost}`,
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

      const result = await restrictedFetch(mockUrl);

      expect(result).toBe(mockResponse);
    });

    it('should handle fetch errors', async () => {
      const errorResponse = new Error('Network error');
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        errorResponse,
      );

      await expect(restrictedFetch(mockUrl)).rejects.toThrow('Network error');
    });

    it('should handle multiple arguments correctly', async () => {
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      };

      await restrictedFetch(mockUrl, options);

      expect(global.fetch).toHaveBeenCalledWith(mockUrl, options);
    });

    it('should handle Request objects correctly', async () => {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const request = new Request(mockUrl);

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
