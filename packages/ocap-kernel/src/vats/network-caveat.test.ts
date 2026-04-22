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
});

describe('makeHostCaveat', () => {
  it('allows allowed hosts', async () => {
    const caveat = makeHostCaveat(['example.test', 'api.github.com']);
    expect(await caveat('https://example.test/path')).toBeUndefined();
    expect(await caveat('https://api.github.com/users')).toBeUndefined();
  });

  it('rejects disallowed hosts', async () => {
    const caveat = makeHostCaveat(['example.test']);
    await expect(caveat('https://malicious.test/path')).rejects.toThrow(
      'Invalid host: malicious.test',
    );
  });

  it('passes file:// URLs through', async () => {
    const caveat = makeHostCaveat([]);
    expect(await caveat('file:///tmp/data.json')).toBeUndefined();
  });

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
});
