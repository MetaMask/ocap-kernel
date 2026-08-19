import { makeTwoFacedFetchInput } from '@ocap/repo-tools/test-utils/fetch-input';
import { describe, expect, it, vi } from 'vitest';

import { makeHostCaveat, makeCaveatedFetch } from './network-caveat.ts';

describe('makeHostCaveat', () => {
  it('allows allowed hostnames', async () => {
    const caveat = makeHostCaveat(['example.test', 'api.github.com']);
    expect(await caveat(new URL('https://example.test/path'))).toBeUndefined();
    expect(
      await caveat(new URL('https://api.github.com/users')),
    ).toBeUndefined();
  });

  it('rejects disallowed hostnames', async () => {
    const caveat = makeHostCaveat(['example.test']);
    await expect(
      caveat(new URL('https://malicious.test/path')),
    ).rejects.toThrow('Invalid host: malicious.test');
  });

  it('ignores port when matching hostnames', async () => {
    const caveat = makeHostCaveat(['api.example.test']);
    expect(
      await caveat(new URL('https://api.example.test:8443/path')),
    ).toBeUndefined();
  });

  it('rejects file: URLs with an fs-capability hint', async () => {
    const caveat = makeHostCaveat(['example.test']);
    await expect(caveat(new URL('file:///etc/passwd'))).rejects.toThrow(
      /fetch cannot target file:\/\/ URLs.*fs platform capability/u,
    );
  });

  it.each([
    { label: 'data:', input: 'data:text/plain,hello' },
    { label: 'blob:', input: 'blob:https://example.test/abc123' },
  ])(
    'rejects $label URLs via the hostname check (opaque origin has empty hostname)',
    async ({ input }) => {
      const caveat = makeHostCaveat(['example.test']);
      await expect(caveat(new URL(input))).rejects.toThrow('Invalid host:');
    },
  );
});

describe('makeCaveatedFetch', () => {
  it('applies caveat and forwards to fetch', async () => {
    const mockResponse = new Response('test');
    const baseFetch = vi.fn().mockResolvedValue(mockResponse);
    const caveat = vi.fn().mockResolvedValue(undefined);

    const caveated = makeCaveatedFetch(baseFetch, caveat);
    const result = await caveated('https://example.test/path');

    expect(caveat).toHaveBeenCalledWith(new URL('https://example.test/path'));
    expect(baseFetch).toHaveBeenCalledWith('https://example.test/path');
    expect(result).toBe(mockResponse);
  });

  it('does not call fetch when caveat rejects', async () => {
    const baseFetch = vi.fn();
    const caveat = vi.fn().mockRejectedValue(new Error('Host not allowed'));

    const caveated = makeCaveatedFetch(baseFetch, caveat);
    await expect(caveated('https://malicious.test/path')).rejects.toThrow(
      'Host not allowed',
    );
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it('forwards init options to fetch', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response('test'));
    const caveat = vi.fn().mockResolvedValue(undefined);

    const caveated = makeCaveatedFetch(baseFetch, caveat);
    const init = { method: 'POST', body: 'data' };
    await caveated('https://example.test/path', init);

    expect(caveat).toHaveBeenCalledWith(
      new URL('https://example.test/path'),
      init,
    );
    expect(baseFetch).toHaveBeenCalledWith('https://example.test/path', init);
  });

  it('forwards a URL object as its href', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const caveated = makeCaveatedFetch(
      baseFetch,
      makeHostCaveat(['example.test']),
    );

    await caveated(new URL('https://example.test/path'));

    expect(baseFetch).toHaveBeenCalledWith('https://example.test/path');
  });

  it('forwards a copy of a Request, never the vat’s own', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const caveated = makeCaveatedFetch(
      baseFetch,
      makeHostCaveat(['example.test']),
    );
    const request = new Request('https://example.test/path');

    await caveated(request);

    const [forwarded] = baseFetch.mock.calls[0] as [Request];
    expect(forwarded).toBeInstanceOf(Request);
    expect(forwarded).not.toBe(request);
    expect(forwarded.url).toBe('https://example.test/path');
  });

  it('rejects malformed URLs by propagating the URL constructor error', async () => {
    const baseFetch = vi.fn();
    const caveated = makeCaveatedFetch(
      baseFetch,
      makeHostCaveat(['example.test']),
    );

    await expect(caveated('not a url')).rejects.toThrow(/Invalid URL/u);
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it('composes host caveat with base fetch end-to-end', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const caveated = makeCaveatedFetch(
      baseFetch,
      makeHostCaveat(['example.test']),
    );

    const response = await caveated('https://example.test/data');
    expect(await response.text()).toBe('ok');
    expect(baseFetch).toHaveBeenCalledTimes(1);

    await expect(caveated('https://evil.test/data')).rejects.toThrow(
      'Invalid host: evil.test',
    );
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  describe('input that resolves differently on each read', () => {
    it('rejects rather than quietly fetching whichever URL was shown first', async () => {
      const baseFetch = vi.fn();
      const caveated = makeCaveatedFetch(
        baseFetch,
        makeHostCaveat(['example.test']),
      );

      await expect(
        caveated(
          makeTwoFacedFetchInput(
            'https://example.test/decoy',
            'https://evil.test/exfil',
          ).input,
        ),
      ).rejects.toThrow('resolved to a different URL when read again');
      expect(baseFetch).not.toHaveBeenCalled();
    });

    it('still host-checks a stringifier that resolves consistently', async () => {
      const baseFetch = vi.fn();
      const caveated = makeCaveatedFetch(
        baseFetch,
        makeHostCaveat(['example.test']),
      );

      await expect(
        caveated(
          makeTwoFacedFetchInput(
            'https://evil.test/exfil',
            'https://evil.test/exfil',
          ).input,
        ),
      ).rejects.toThrow('Invalid host: evil.test');
      expect(baseFetch).not.toHaveBeenCalled();
    });

    it('rejects a file: URL hidden behind a second read', async () => {
      const baseFetch = vi.fn();
      const caveated = makeCaveatedFetch(
        baseFetch,
        makeHostCaveat(['example.test']),
      );

      await expect(
        caveated(
          makeTwoFacedFetchInput(
            'https://example.test/decoy',
            'file:///etc/passwd',
          ).input,
        ),
      ).rejects.toThrow('resolved to a different URL when read again');
      expect(baseFetch).not.toHaveBeenCalled();
    });
  });

  it('rejects a Request subclass that overrides its url getter', async () => {
    class SpoofedRequest extends Request {
      override get url(): string {
        return 'https://example.test/decoy';
      }
    }
    const baseFetch = vi.fn();
    const caveated = makeCaveatedFetch(
      baseFetch,
      makeHostCaveat(['example.test']),
    );

    await expect(
      caveated(new SpoofedRequest('https://evil.test/exfil')),
    ).rejects.toThrow('Invalid host: evil.test');
    expect(baseFetch).not.toHaveBeenCalled();
  });
});
