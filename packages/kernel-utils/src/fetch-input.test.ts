import { makeTwoFacedFetchInput } from '@ocap/repo-tools/test-utils/fetch-input';
import { describe, expect, it } from 'vitest';

import { resolveFetchInput } from './fetch-input.ts';

describe('resolveFetchInput', () => {
  it.each([
    { name: 'string', makeInput: () => 'https://example.test/path' },
    {
      name: 'URL object',
      makeInput: () => new URL('https://example.test/path'),
    },
    {
      name: 'Request',
      makeInput: () => new Request('https://example.test/path'),
    },
  ])('resolves the URL of a $name input', ({ makeInput }) => {
    const { url } = resolveFetchInput(makeInput());
    expect(url).toBeInstanceOf(URL);
    expect(url.href).toBe('https://example.test/path');
  });

  it('forwards a string input unchanged', () => {
    const original = 'https://example.test/path';
    expect(resolveFetchInput(original).input).toBe(original);
  });

  it('forwards a copy of a Request, never the caller’s own', async () => {
    const original = new Request('https://example.test/path', {
      method: 'POST',
      body: 'payload',
      headers: { 'x-test': '1' },
    });

    const forwarded = resolveFetchInput(original).input as Request;

    expect(forwarded).not.toBe(original);
    expect(forwarded).toBeInstanceOf(Request);
    expect(forwarded.method).toBe('POST');
    expect(forwarded.headers.get('x-test')).toBe('1');
    expect(await forwarded.text()).toBe('payload');
  });

  it('replaces a URL object with its href', () => {
    const { input } = resolveFetchInput(new URL('https://example.test/path'));
    expect(input).toBe('https://example.test/path');
  });

  it('throws for malformed URLs', () => {
    expect(() => resolveFetchInput('not a url')).toThrow(/Invalid URL/u);
  });

  it('throws for an input that resolves differently on a second read', () => {
    const { input } = makeTwoFacedFetchInput(
      'https://example.test/decoy',
      'https://evil.test/target',
    );

    expect(() => resolveFetchInput(input)).toThrow(
      'fetch input resolved to a different URL when read again.',
    );
  });

  it('accepts a stable stringifier and forwards the string it resolved to', () => {
    const { input, getReads } = makeTwoFacedFetchInput(
      'https://example.test/path',
      'https://example.test/path',
    );
    const resolved = resolveFetchInput(input);

    expect(resolved.url.href).toBe('https://example.test/path');
    // The stand-in is a primitive, so re-reading it cannot yield anything
    // else, however many times `fetch` reads it.
    expect(resolved.input).toBe('https://example.test/path');
    expect(getReads()).toBe(2);
  });

  it('reads a Request subclass through the internal slot, not an overridden getter', () => {
    class SpoofedRequest extends Request {
      override get url(): string {
        return 'https://example.test/decoy';
      }
    }
    const request = new SpoofedRequest('https://evil.test/target');

    // The override is what naive validation would trust...
    expect(request.url).toBe('https://example.test/decoy');
    // ...but `fetch` uses the internal slot, and so does the resolver.
    expect(resolveFetchInput(request).url.href).toBe(
      'https://evil.test/target',
    );
    expect(new Request(request).url).toBe('https://evil.test/target');
  });

  it('resolves a Request whose backing state answers differently on each read', () => {
    const decoy = 'https://example.test/decoy';
    const target = 'https://evil.test/target';
    const request = new Request(decoy);

    // Where a runtime keeps a Request's state in a mutable own property —
    // undici on Node 22 uses a configurable symbol — the caller can make the
    // original report the decoy once and the target thereafter. Where the
    // state is a private field this loop finds nothing to redefine and the
    // assertions below are simply the ordinary case.
    for (const key of Object.getOwnPropertySymbols(request)) {
      const state = Reflect.get(request, key) as { urlList?: URL[] };
      if (!state?.urlList) {
        continue;
      }
      const tampered = {
        ...state,
        url: new URL(target),
        urlList: [new URL(target)],
      };
      let reads = 0;
      Object.defineProperty(request, key, {
        configurable: true,
        get: () => {
          reads += 1;
          return reads === 1 ? state : tampered;
        },
      });
    }

    const resolved = resolveFetchInput(request);

    // The security property, whatever the original now reports: what `fetch`
    // will resolve the forwarded input to is what was validated.
    expect(resolved.input).not.toBe(request);
    expect(new Request(resolved.input as Request).url).toBe(resolved.url.href);
  });

  it('resolves a Request to a URL the caller cannot mutate afterwards', () => {
    const href = 'https://example.test/path';
    const request = new Request(href);
    // A caller that can reach the state can leave a `URL` of its own in it,
    // then change it in the window between the check and the send. Where the
    // state is private this loop finds nothing and the assertion below is
    // simply the ordinary case.
    const planted = new URL(href);
    for (const key of Object.getOwnPropertySymbols(request)) {
      const state = Reflect.get(request, key) as { urlList?: URL[] };
      if (!state?.urlList) {
        continue;
      }
      Object.defineProperty(request, key, {
        configurable: true,
        value: { ...state, url: planted, urlList: [planted] },
      });
    }

    const resolved = resolveFetchInput(request);
    planted.hostname = 'evil.test';

    expect(resolved.url.href).toBe(href);
    expect(new Request(resolved.input as Request).url).toBe(href);
  });

  it('does not carry over a dispatcher planted on the caller’s Request', () => {
    // Rebuilding the request reads its argument as a `RequestInit`, by string
    // name. `dispatcher` is undici's extension for choosing where the bytes go,
    // so a planted one would route the request anywhere regardless of the URL.
    // Copying first means only a genuine `Request`'s internals are read.
    const planted = { dispatch: () => true, close: () => undefined };
    const request = new Request('https://example.test/path');
    Object.defineProperty(request, 'dispatcher', {
      configurable: true,
      get: () => planted,
    });

    const { input } = resolveFetchInput(request);

    const carried = Object.getOwnPropertySymbols(input as Request)
      .filter((key) => String(key).includes('dispatcher'))
      .map((key) => Reflect.get(input as Request, key));
    expect(carried).not.toContain(planted);
  });

  it('throws for an object wearing Request.prototype without the internal slot', () => {
    const fake = Object.create(Request.prototype);
    Object.defineProperty(fake, 'url', { value: 'https://example.test/decoy' });

    expect(fake).toBeInstanceOf(Request);
    expect(() => resolveFetchInput(fake)).toThrow(TypeError);
  });
});
