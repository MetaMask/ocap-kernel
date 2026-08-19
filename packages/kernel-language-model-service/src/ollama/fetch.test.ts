import '@ocap/repo-tools/test-utils/mock-endoify';
import { makeTwoFacedFetchInput } from '@ocap/repo-tools/test-utils/fetch-input';
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
      const request = new Request(mockUrl);

      await restrictedFetch(request);

      // Forwarded as an equivalent copy, never the caller's own.
      const [forwarded] = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0] as [Request];
      expect(forwarded).toBeInstanceOf(Request);
      expect(forwarded).not.toBe(request);
      expect(forwarded.url).toBe(mockUrl);
    });
  });

  describe('input that resolves differently on each read', () => {
    it('throws rather than quietly fetching whichever URL was shown first', async () => {
      await expect(
        restrictedFetch(
          makeTwoFacedFetchInput(mockUrl, 'http://malicious.com/exfil').input,
        ),
      ).rejects.toThrow('resolved to a different URL when read again');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('still host-checks a stringifier that resolves consistently', async () => {
      await expect(
        restrictedFetch(
          makeTwoFacedFetchInput(
            'http://malicious.com/exfil',
            'http://malicious.com/exfil',
          ).input,
        ),
      ).rejects.toThrow('Invalid host: malicious.com');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('throws for a Request subclass that overrides its url getter', async () => {
      class SpoofedRequest extends Request {
        override get url(): string {
          return mockUrl;
        }
      }

      await expect(
        restrictedFetch(new SpoofedRequest('http://malicious.com/exfil')),
      ).rejects.toThrow('Invalid host: malicious.com');

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('hardening', () => {
    it('should return a hardened function', () => {
      // The mock harden implementation is (x) => x.
      expect(hardenSpy).toHaveBeenCalledWith(restrictedFetch);
    });
  });
});
