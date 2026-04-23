import { describe, expect, it, vi } from 'vitest';

import {
  resolveUrl,
  makeHostCaveat,
  makeCaveatedFetch,
} from './network-caveat.ts';

describe('resolveUrl', () => {
  it.each([
    { name: 'string URL', input: 'https://example.test/path' },
    {
      name: 'Request object URL',
      input: new Request('https://example.test/path'),
    },
    { name: 'URL object', input: new URL('https://example.test/path') },
  ])('resolves $name', ({ input }) => {
    const result = resolveUrl(input);
    expect(result).toBeInstanceOf(URL);
    expect(result.href).toBe('https://example.test/path');
  });

  it('throws for malformed string URLs', () => {
    expect(() => resolveUrl('not a url')).toThrow(/Invalid URL/u);
  });
});

describe('makeHostCaveat', () => {
  it('allows allowed hostnames', async () => {
    const caveat = makeHostCaveat(['example.test', 'api.github.com']);
    expect(await caveat('https://example.test/path')).toBeUndefined();
    expect(await caveat('https://api.github.com/users')).toBeUndefined();
  });

  it('rejects disallowed hostnames', async () => {
    const caveat = makeHostCaveat(['example.test']);
    await expect(caveat('https://malicious.test/path')).rejects.toThrow(
      'Invalid host: malicious.test',
    );
  });

  it('ignores port when matching hostnames', async () => {
    const caveat = makeHostCaveat(['api.example.test']);
    expect(await caveat('https://api.example.test:8443/path')).toBeUndefined();
  });

  it.each([
    { label: 'file: string input', input: 'file:///etc/passwd' },
    { label: 'file: Request input', input: new Request('file:///etc/passwd') },
  ])('rejects $label with an fs-capability hint', async ({ input }) => {
    const caveat = makeHostCaveat(['example.test']);
    await expect(caveat(input)).rejects.toThrow(
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
      await expect(caveat(input)).rejects.toThrow('Invalid host:');
    },
  );

  it.each([
    {
      name: 'Request objects',
      input: new Request('https://example.test/path'),
    },
    { name: 'URL objects', input: new URL('https://example.test/path') },
  ])('handles $name', async ({ input }) => {
    const caveat = makeHostCaveat(['example.test']);
    expect(await caveat(input)).toBeUndefined();
  });

  it('rejects malformed URLs by propagating the URL constructor error', async () => {
    const caveat = makeHostCaveat(['example.test']);
    await expect(caveat('not a url')).rejects.toThrow(/Invalid URL/u);
  });
});

describe('makeCaveatedFetch', () => {
  it('applies caveat and forwards to fetch', async () => {
    const mockResponse = new Response('test');
    const baseFetch = vi.fn().mockResolvedValue(mockResponse);
    const caveat = vi.fn().mockResolvedValue(undefined);

    const caveated = makeCaveatedFetch(baseFetch, caveat);
    const result = await caveated('https://example.test/path');

    expect(caveat).toHaveBeenCalledWith('https://example.test/path');
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

    expect(caveat).toHaveBeenCalledWith('https://example.test/path', init);
    expect(baseFetch).toHaveBeenCalledWith('https://example.test/path', init);
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
});
