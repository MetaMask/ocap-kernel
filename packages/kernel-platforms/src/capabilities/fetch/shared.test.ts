import { describe, expect, it, vi } from 'vitest';

import {
  resolveUrl,
  makeHostCaveat,
  makeFetchCaveat,
  makeCaveatedFetch,
} from './shared.ts';

describe('resolveUrl', () => {
  it.each([
    { name: 'string URL', input: 'https://example.test/path' },
    {
      name: 'Request object URL',
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
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
    const allowedHosts = ['example.test', 'api.github.com'];
    const caveat = makeHostCaveat(allowedHosts);

    expect(await caveat('https://example.test/path')).toBeUndefined();
    expect(await caveat('https://api.github.com/users')).toBeUndefined();
  });

  it('rejects disallowed hosts', async () => {
    const allowedHosts = ['example.test'];
    const caveat = makeHostCaveat(allowedHosts);

    await expect(caveat('https://malicious.test/path')).rejects.toThrow(
      'Invalid host: malicious.test',
    );
  });

  it.each([
    {
      name: 'Request objects',
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      input: new Request('https://example.test/path'),
    },
    { name: 'URL objects', input: new URL('https://example.test/path') },
  ])('handles $name', async ({ input }) => {
    const allowedHosts = ['example.test'];
    const caveat = makeHostCaveat(allowedHosts);

    expect(await caveat(input)).toBeUndefined();
  });
});

describe('makeFetchCaveat', () => {
  it('creates caveat with hosts', async () => {
    const config = { allowedHosts: ['example.test'] };
    const caveat = makeFetchCaveat(config);

    expect(await caveat('https://example.test/path')).toBeUndefined();
    await expect(caveat('https://malicious.test/path')).rejects.toThrow(
      'Invalid host: malicious.test',
    );
  });

  it('creates caveat with empty hosts', async () => {
    const config = { allowedHosts: [] };
    const caveat = makeFetchCaveat(config);

    await expect(caveat('https://any-host.com/path')).rejects.toThrow(
      'Invalid host: any-host.com',
    );
  });

  it('creates caveat with undefined hosts', async () => {
    const config = {};
    const caveat = makeFetchCaveat(config);

    await expect(caveat('https://any-host.com/path')).rejects.toThrow(
      'Invalid host: any-host.com',
    );
  });
});

describe('makeCaveatedFetch', () => {
  it('applies caveat and calls fetch', async () => {
    const mockResponse = {
      status: 200,
      text: async () => Promise.resolve('test'),
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
    } as Response;
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    const caveat = vi.fn().mockResolvedValue(undefined);

    const caveatedFetch = makeCaveatedFetch(mockFetch, caveat);

    const result = await caveatedFetch('https://example.test/path');

    expect(caveat).toHaveBeenCalledWith('https://example.test/path');
    expect(mockFetch).toHaveBeenCalledWith('https://example.test/path');
    expect(result).toBe(mockResponse);
  });

  it('throws when caveat rejects', async () => {
    const mockFetch = vi.fn();
    const caveat = vi.fn().mockRejectedValue(new Error('Host not allowed'));

    const caveatedFetch = makeCaveatedFetch(mockFetch, caveat);

    await expect(caveatedFetch('https://malicious.test/path')).rejects.toThrow(
      'Host not allowed',
    );
    expect(caveat).toHaveBeenCalledWith('https://malicious.test/path');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('passes through arguments', async () => {
    const mockResponse = {
      status: 200,
      text: async () => Promise.resolve('test'),
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
    } as Response;
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    const caveat = vi.fn().mockResolvedValue(undefined);

    const caveatedFetch = makeCaveatedFetch(mockFetch, caveat);
    const init = { method: 'POST', body: 'data' };

    await caveatedFetch('https://example.test/path', init);

    expect(caveat).toHaveBeenCalledWith('https://example.test/path', init);
    expect(mockFetch).toHaveBeenCalledWith('https://example.test/path', init);
  });
});

describe('shared fetch capability behavior', () => {
  it('creates capability with restrictions', async () => {
    const mockResponse = {
      status: 200,
      text: async () => Promise.resolve('test'),
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
    } as Response;
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    const caveat = makeFetchCaveat({ allowedHosts: ['example.test'] });
    const caveatedFetch = makeCaveatedFetch(mockFetch, caveat);

    // Should allow allowed host
    const result = await caveatedFetch('https://example.test/path');
    expect(result).toBe(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith('https://example.test/path');

    // Should reject disallowed host
    await expect(caveatedFetch('https://malicious.test/path')).rejects.toThrow(
      'Invalid host: malicious.test',
    );
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only called once for allowed host
  });

  it('passes through arguments', async () => {
    const mockResponse = {
      status: 200,
      text: async () => Promise.resolve('test'),
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
    } as Response;
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    const caveat = makeFetchCaveat({ allowedHosts: ['example.test'] });
    const caveatedFetch = makeCaveatedFetch(mockFetch, caveat);
    const init = { method: 'POST', body: 'data' };

    await caveatedFetch('https://example.test/path', init);

    expect(mockFetch).toHaveBeenCalledWith('https://example.test/path', init);
  });

  it.each([
    {
      name: 'Request objects',
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      input: new Request('https://example.test/path'),
    },
    { name: 'URL objects', input: new URL('https://example.test/path') },
  ])('handles $name', async ({ input }) => {
    const mockResponse = {
      status: 200,
      text: async () => Promise.resolve('test'),
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
    } as Response;
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    const caveat = makeFetchCaveat({ allowedHosts: ['example.test'] });
    const caveatedFetch = makeCaveatedFetch(mockFetch, caveat);

    const result = await caveatedFetch(input);
    expect(result).toBe(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(input);
  });
});
