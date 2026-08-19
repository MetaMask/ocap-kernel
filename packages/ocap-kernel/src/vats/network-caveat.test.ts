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

    const forwarded = { redirect: 'manual', headers: expect.any(Headers) };
    expect(caveat).toHaveBeenCalledWith(
      new URL('https://example.test/path'),
      forwarded,
    );
    expect(baseFetch).toHaveBeenCalledWith(
      'https://example.test/path',
      forwarded,
    );
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

    // One snapshot of the caller's `init`, shared by the caveat and `fetch`.
    const forwarded = {
      ...init,
      redirect: 'manual',
      headers: expect.any(Headers),
    };
    expect(caveat).toHaveBeenCalledWith(
      new URL('https://example.test/path'),
      forwarded,
    );
    expect(baseFetch).toHaveBeenCalledWith(
      'https://example.test/path',
      forwarded,
    );
  });

  it('forwards a URL object as its href', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const caveated = makeCaveatedFetch(
      baseFetch,
      makeHostCaveat(['example.test']),
    );

    await caveated(new URL('https://example.test/path'));

    expect(baseFetch).toHaveBeenCalledWith('https://example.test/path', {
      redirect: 'manual',
      headers: expect.any(Headers),
    });
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

  describe('redirects', () => {
    const redirectTo = (location: string, status = 302): Response =>
      new Response('', { status, headers: { location } });

    it('refuses a hop out of the allowlist, and never requests it', async () => {
      const baseFetch = vi
        .fn()
        .mockResolvedValueOnce(
          redirectTo('http://169.254.169.254/latest/meta-data/'),
        )
        .mockResolvedValue(new Response('credentials'));
      const caveated = makeCaveatedFetch(
        baseFetch,
        makeHostCaveat(['example.test']),
      );

      await expect(caveated('https://example.test/start')).rejects.toThrow(
        'Invalid host: 169.254.169.254',
      );
      expect(baseFetch).toHaveBeenCalledTimes(1);
    });

    it('follows a hop that stays inside the allowlist', async () => {
      const baseFetch = vi
        .fn()
        .mockResolvedValueOnce(redirectTo('https://example.test/landed'))
        .mockResolvedValue(new Response('landed'));
      const caveated = makeCaveatedFetch(
        baseFetch,
        makeHostCaveat(['example.test']),
      );

      const response = await caveated('https://example.test/start');

      expect(await response.text()).toBe('landed');
      expect(response.redirected).toBe(true);
      expect(baseFetch).toHaveBeenNthCalledWith(
        2,
        'https://example.test/landed',
        {
          method: 'GET',
          body: null,
          headers: expect.any(Headers),
          signal: null,
          redirect: 'manual',
        },
      );
    });

    it('refuses a hop to a file: URL by naming the scheme', async () => {
      const baseFetch = vi
        .fn()
        .mockResolvedValueOnce(redirectTo('file:///etc/passwd'));
      const caveated = makeCaveatedFetch(
        baseFetch,
        makeHostCaveat(['example.test']),
      );

      await expect(caveated('https://example.test/start')).rejects.toThrow(
        /redirected to a file: URL, which a guarded fetch will not follow/u,
      );
      expect(baseFetch).toHaveBeenCalledTimes(1);
    });

    it('checks the hop even when the vat asks fetch to follow', async () => {
      const baseFetch = vi
        .fn()
        .mockResolvedValueOnce(redirectTo('https://evil.test/exfil'))
        .mockResolvedValue(new Response('exfiltrated'));
      const caveated = makeCaveatedFetch(
        baseFetch,
        makeHostCaveat(['example.test']),
      );

      await expect(
        caveated('https://example.test/start', { redirect: 'follow' }),
      ).rejects.toThrow('Invalid host: evil.test');
      expect(baseFetch).toHaveBeenCalledTimes(1);
    });

    it.each(['manual', 'error'] as const)(
      'leaves the forbidden host uncontacted when the vat asks for redirect: %s',
      async (redirect) => {
        const baseFetch = vi
          .fn()
          .mockResolvedValueOnce(redirectTo('https://evil.test/exfil'))
          .mockResolvedValue(new Response('exfiltrated'));
        const caveated = makeCaveatedFetch(
          baseFetch,
          makeHostCaveat(['example.test']),
        );

        // A vat asking for less than `follow` is obeyed, which cannot reach
        // further than the guarded walk would have.
        await caveated('https://example.test/start', { redirect }).catch(
          () => undefined,
        );
        expect(baseFetch).toHaveBeenCalledTimes(1);
      },
    );

    it('checks the hop even when the vat’s Request asks fetch to follow', async () => {
      const baseFetch = vi
        .fn()
        .mockResolvedValueOnce(redirectTo('https://evil.test/exfil'))
        .mockResolvedValue(new Response('exfiltrated'));
      const caveated = makeCaveatedFetch(
        baseFetch,
        makeHostCaveat(['example.test']),
      );

      await expect(
        caveated(
          new Request('https://example.test/start', { redirect: 'follow' }),
        ),
      ).rejects.toThrow('Invalid host: evil.test');
      expect(baseFetch).toHaveBeenCalledTimes(1);
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
