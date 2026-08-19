import { fetchMock } from '@ocap/repo-tools/test-utils/fetch-mock';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { makeGuardedFetch } from './guarded-fetch.ts';
import type { FetchGuard } from './guarded-fetch.ts';

type ReceivedRequest = {
  method: string;
  path: string;
  body: string;
  headers: http.IncomingHttpHeaders;
};

type Responder = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
) => void;

type TestServer = {
  /** The port the server listens on, addressable via any loopback name. */
  port: number;
  /** Every request the server received, in order. */
  received: ReceivedRequest[];
  /** Replace what the server answers with. */
  respondWith: (responder: Responder) => void;
};

const running: http.Server[] = [];

/**
 * Start a loopback HTTP server that records what it receives. Bound on every
 * interface rather than one address, so that `localhost` and `127.0.0.1` both
 * reach it and can stand in for an allowed and a forbidden host.
 *
 * @returns A handle on the running server.
 */
const startServer = async (): Promise<TestServer> => {
  const received: ReceivedRequest[] = [];
  let responder: Responder = (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('landed');
  };
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      received.push({
        method: request.method as string,
        path: request.url as string,
        body,
        headers: request.headers,
      });
      responder(request, response);
    });
  });
  running.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  return {
    port: (server.address() as AddressInfo).port,
    received,
    respondWith: (next: Responder) => {
      responder = next;
    },
  };
};

/**
 * Answer every request with a redirect to `location`.
 *
 * @param status - The redirect status to answer with.
 * @param location - The `Location` header to send.
 * @returns A responder.
 */
const redirectTo =
  (status: number, location: string): Responder =>
  (_request, response) => {
    response.writeHead(status, { location });
    response.end('redirecting');
  };

/**
 * A guard that allows `localhost` only, so that `127.0.0.1` names a forbidden
 * host on the very same loopback interface.
 *
 * @param url - The URL about to be requested.
 */
const allowLocalhost: FetchGuard = async (url: URL) => {
  if (url.hostname !== 'localhost') {
    throw new Error(`Invalid host: ${url.hostname}`);
  }
};

/**
 * A request body that cannot be sent twice.
 *
 * @param text - What the stream yields.
 * @returns The body, and the `duplex` that sending a stream requires.
 */
const streamBody = (text: string): RequestInit => ({
  // ReadableStream is flagged experimental for Node 22, but this case works.
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  body: new ReadableStream({
    start: (controller) => {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  }),
  duplex: 'half',
});

describe('makeGuardedFetch', () => {
  beforeAll(() => {
    // Redirect handling is undici's behaviour as much as ours, so these tests
    // run against live servers; the repo-wide fetch mock would answer instead.
    fetchMock.disableMocks();
  });

  afterAll(() => {
    fetchMock.enableMocks();
  });

  afterEach(async () => {
    await Promise.all(
      running.splice(0).map(
        async (server) =>
          await new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
  });

  it('passes a request the guard allows straight through', async () => {
    const server = await startServer();
    const guarded = makeGuardedFetch({
      baseFetch: fetch,
      guard: allowLocalhost,
    });

    const response = await guarded(`http://localhost:${server.port}/thing`);

    expect(await response.text()).toBe('landed');
    expect(response.redirected).toBe(false);
    expect(response.url).toBe(`http://localhost:${server.port}/thing`);
  });

  it('refuses a request the guard rejects', async () => {
    const server = await startServer();
    const guarded = makeGuardedFetch({
      baseFetch: fetch,
      guard: allowLocalhost,
    });

    await expect(guarded(`http://127.0.0.1:${server.port}/`)).rejects.toThrow(
      'Invalid host: 127.0.0.1',
    );
    expect(server.received).toStrictEqual([]);
  });

  describe('redirects', () => {
    it('refuses a redirect to a host the guard rejects, and never contacts it', async () => {
      const forbidden = await startServer();
      const allowed = await startServer();
      allowed.respondWith(
        redirectTo(302, `http://127.0.0.1:${forbidden.port}/secrets`),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await expect(
        guarded(`http://localhost:${allowed.port}/start`),
      ).rejects.toThrow('Invalid host: 127.0.0.1');

      expect(allowed.received).toHaveLength(1);
      expect(forbidden.received).toStrictEqual([]);
    });

    it('follows a redirect the guard allows and returns the final response', async () => {
      const first = await startServer();
      const second = await startServer();
      first.respondWith(
        redirectTo(302, `http://localhost:${second.port}/landed`),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      const response = await guarded(`http://localhost:${first.port}/start`);

      expect(await response.text()).toBe('landed');
      expect(response.url).toBe(`http://localhost:${second.port}/landed`);
      expect(response.redirected).toBe(true);
      expect(second.received[0]?.path).toBe('/landed');
    });

    it('follows a chain of allowed hops and re-runs the guard on each', async () => {
      const server = await startServer();
      const origin = `http://localhost:${server.port}`;
      server.respondWith((request, response) => {
        if (request.url === '/one') {
          response.writeHead(302, { location: `${origin}/two` });
        } else if (request.url === '/two') {
          response.writeHead(302, { location: `${origin}/three` });
        } else {
          response.writeHead(200);
          response.end('arrived');
        }
        response.end();
      });
      const guard = vi.fn(allowLocalhost);
      const guarded = makeGuardedFetch({ baseFetch: fetch, guard });

      const response = await guarded(`${origin}/one`);

      expect(await response.text()).toBe('arrived');
      expect(response.url).toBe(`${origin}/three`);
      expect(response.redirected).toBe(true);
      expect(guard.mock.calls.map(([url]) => url.pathname)).toStrictEqual([
        '/one',
        '/two',
        '/three',
      ]);
    });

    it('refuses a hop out of the allowlist part-way through a chain', async () => {
      const forbidden = await startServer();
      const allowed = await startServer();
      allowed.respondWith((request, response) => {
        response.writeHead(302, {
          location:
            request.url === '/one'
              ? `http://localhost:${allowed.port}/two`
              : `http://127.0.0.1:${forbidden.port}/secrets`,
        });
        response.end();
      });
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await expect(
        guarded(`http://localhost:${allowed.port}/one`),
      ).rejects.toThrow('Invalid host: 127.0.0.1');
      expect(forbidden.received).toStrictEqual([]);
    });

    it('follows a redirect back to an allowed host', async () => {
      const other = await startServer();
      const home = await startServer();
      home.respondWith((request, response) => {
        if (request.url === '/out') {
          response.writeHead(302, {
            location: `http://127.0.0.1:${other.port}/via`,
          });
          response.end();
        } else {
          response.writeHead(200);
          response.end('home again');
        }
      });
      other.respondWith(redirectTo(302, `http://localhost:${home.port}/back`));
      // Both loopback names allowed, so the excursion is legitimate.
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: async ({ hostname }) => {
          if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            throw new Error(`Invalid host: ${hostname}`);
          }
        },
      });

      const response = await guarded(`http://localhost:${home.port}/out`);

      expect(await response.text()).toBe('home again');
      expect(response.url).toBe(`http://localhost:${home.port}/back`);
      expect(response.redirected).toBe(true);
    });

    it('gives up on a redirect loop after 20 hops', async () => {
      const server = await startServer();
      const origin = `http://localhost:${server.port}`;
      server.respondWith(redirectTo(302, `${origin}/loop`));
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await expect(guarded(`${origin}/loop`)).rejects.toThrow(
        'exceeded 20 redirects',
      );
      // The initial request plus the 20 hops it was allowed.
      expect(server.received).toHaveLength(21);
    });

    it('returns a redirect status that carries no Location as a response', async () => {
      const server = await startServer();
      server.respondWith((_request, response) => {
        response.writeHead(302);
        response.end('nowhere');
      });
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      const response = await guarded(`http://localhost:${server.port}/`);

      expect(response.status).toBe(302);
      expect(response.redirected).toBe(false);
      expect(await response.text()).toBe('nowhere');
    });

    it('resolves a relative Location against the hop that sent it', async () => {
      const second = await startServer();
      const first = await startServer();
      // The relative hop is the second one, so a `Location` resolved against
      // the URL the caller asked for lands on the wrong server entirely.
      first.respondWith(
        redirectTo(302, `http://localhost:${second.port}/deep/start`),
      );
      second.respondWith((request, response) => {
        if (request.url === '/deep/start') {
          response.writeHead(301, { location: '../landed' });
          response.end();
        } else {
          response.writeHead(200);
          response.end('relative');
        }
      });
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      const response = await guarded(`http://localhost:${first.port}/one`);

      expect(await response.text()).toBe('relative');
      expect(response.url).toBe(`http://localhost:${second.port}/landed`);
      expect(first.received.map(({ path }) => path)).toStrictEqual(['/one']);
    });
  });

  describe('the redirect mode the caller asks for', () => {
    /**
     * A server that redirects out of the allowlist, and the forbidden server
     * it points at.
     *
     * @returns Both servers.
     */
    const startEscapeRoute = async (): Promise<{
      allowed: TestServer;
      forbidden: TestServer;
    }> => {
      const forbidden = await startServer();
      const allowed = await startServer();
      allowed.respondWith(
        redirectTo(302, `http://127.0.0.1:${forbidden.port}/secrets`),
      );
      return { allowed, forbidden };
    };

    it('checks the hop when init asks fetch to follow', async () => {
      const { allowed, forbidden } = await startEscapeRoute();
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await expect(
        guarded(`http://localhost:${allowed.port}/start`, {
          redirect: 'follow',
        }),
      ).rejects.toThrow('Invalid host: 127.0.0.1');
      expect(forbidden.received).toStrictEqual([]);
    });

    it('checks the hop when a Request asks fetch to follow', async () => {
      const { allowed, forbidden } = await startEscapeRoute();
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await expect(
        guarded(
          new Request(`http://localhost:${allowed.port}/start`, {
            redirect: 'follow',
          }),
        ),
      ).rejects.toThrow('Invalid host: 127.0.0.1');
      expect(forbidden.received).toStrictEqual([]);
    });

    it('hands back the redirect unfollowed when the caller asks for manual', async () => {
      const { allowed, forbidden } = await startEscapeRoute();
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      const response = await guarded(`http://localhost:${allowed.port}/start`, {
        redirect: 'manual',
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(
        `http://127.0.0.1:${forbidden.port}/secrets`,
      );
      expect(response.redirected).toBe(false);
      expect(forbidden.received).toStrictEqual([]);
    });

    it('fails the fetch when the caller asks for error', async () => {
      const { allowed, forbidden } = await startEscapeRoute();
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await expect(
        guarded(`http://localhost:${allowed.port}/start`, {
          redirect: 'error',
        }),
      ).rejects.toThrow(/was redirected, and redirect: 'error' was requested/u);
      expect(forbidden.received).toStrictEqual([]);
    });

    it('follows a hop for a caller that asked for manual but was not redirected', async () => {
      const server = await startServer();
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      const response = await guarded(`http://localhost:${server.port}/thing`, {
        redirect: 'manual',
      });

      expect(await response.text()).toBe('landed');
    });
  });

  describe('a caller-supplied dispatcher', () => {
    it('is refused rather than dropped, since dropping it would egress anyway', async () => {
      const server = await startServer();
      const dispatch = vi.fn();
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await expect(
        guarded(`http://localhost:${server.port}/`, {
          dispatcher: { dispatch, close: async () => undefined },
        } as unknown as RequestInit),
      ).rejects.toThrow(/cannot accept a `dispatcher`/u);
      expect(dispatch).not.toHaveBeenCalled();
      expect(server.received).toStrictEqual([]);
    });

    it('is shed from a Request rather than refused, being unreadable there', async () => {
      const server = await startServer();
      const dispatch = vi.fn();
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      // A `Request` exposes no dispatcher to check for — undici keeps it out
      // of reach on some runtimes — so `resolveFetchInput`'s rebuild dropping
      // it is the whole defence. This test is what notices if that changes.
      const response = await guarded(
        new Request(`http://localhost:${server.port}/`, {
          dispatcher: { dispatch, close: async () => undefined },
        } as unknown as RequestInit),
      );

      expect(await response.text()).toBe('landed');
      expect(dispatch).not.toHaveBeenCalled();
      expect(server.received).toHaveLength(1);
    });

    it('is not confused by an absent one', async () => {
      const server = await startServer();
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      const response = await guarded(`http://localhost:${server.port}/`, {
        dispatcher: undefined,
      } as unknown as RequestInit);

      expect(await response.text()).toBe('landed');
    });
  });

  describe('method and body across a redirect', () => {
    it('leaves a HEAD alone on a 303, which rewrites everything else', async () => {
      const destination = await startServer();
      const start = await startServer();
      start.respondWith(
        redirectTo(303, `http://localhost:${destination.port}/landed`),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await guarded(`http://localhost:${start.port}/start`, { method: 'HEAD' });

      expect(destination.received[0]?.method).toBe('HEAD');
    });

    it.each([
      { status: 307, method: 'POST' },
      { status: 308, method: 'POST' },
      { status: 302, method: 'PUT' },
    ])(
      'keeps the method and body across a $status from a $method',
      async ({ status, method }) => {
        const destination = await startServer();
        const start = await startServer();
        start.respondWith(
          redirectTo(status, `http://localhost:${destination.port}/landed`),
        );
        const guarded = makeGuardedFetch({
          baseFetch: fetch,
          guard: allowLocalhost,
        });

        const response = await guarded(`http://localhost:${start.port}/start`, {
          method,
          body: 'payload',
          headers: { 'content-type': 'text/plain' },
        });

        expect(await response.text()).toBe('landed');
        expect(destination.received[0]).toMatchObject({
          method,
          body: 'payload',
        });
        expect(destination.received[0]?.headers['content-type']).toBe(
          'text/plain',
        );
      },
    );

    it.each([
      { status: 301, method: 'POST' },
      { status: 302, method: 'POST' },
      { status: 303, method: 'POST' },
      { status: 303, method: 'PUT' },
      // `fetch` upper-cases the methods it knows, so the rewrite has to too.
      { status: 302, method: 'post' },
    ])(
      'turns a $method into a bodyless GET on a $status',
      async ({ status, method }) => {
        const destination = await startServer();
        const start = await startServer();
        start.respondWith(
          redirectTo(status, `http://localhost:${destination.port}/landed`),
        );
        const guarded = makeGuardedFetch({
          baseFetch: fetch,
          guard: allowLocalhost,
        });

        await guarded(`http://localhost:${start.port}/start`, {
          method,
          body: 'payload',
          headers: {
            'content-type': 'text/plain',
            'content-language': 'en',
            'content-location': '/here',
          },
        });

        expect(destination.received[0]).toMatchObject({
          method: 'GET',
          body: '',
        });
        expect(
          destination.received[0]?.headers['content-type'],
        ).toBeUndefined();
        expect(
          destination.received[0]?.headers['content-length'],
        ).toBeUndefined();
        expect(
          destination.received[0]?.headers['content-language'],
        ).toBeUndefined();
        expect(
          destination.received[0]?.headers['content-location'],
        ).toBeUndefined();
      },
    );

    it('refuses to replay a stream body rather than truncating the request', async () => {
      const destination = await startServer();
      const start = await startServer();
      start.respondWith(
        redirectTo(307, `http://localhost:${destination.port}/landed`),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await expect(
        guarded(`http://localhost:${start.port}/start`, {
          method: 'POST',
          ...streamBody('streamed'),
        }),
      ).rejects.toThrow(
        /Cannot follow the 307 redirect .* cannot be sent a second time/u,
      );
      expect(destination.received).toStrictEqual([]);
    });

    it('drops a stream body on a 303 instead of failing, since the hop does not keep it', async () => {
      const destination = await startServer();
      const start = await startServer();
      start.respondWith(
        redirectTo(303, `http://localhost:${destination.port}/landed`),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      const response = await guarded(`http://localhost:${start.port}/start`, {
        method: 'POST',
        ...streamBody('streamed'),
      });

      expect(await response.text()).toBe('landed');
      expect(destination.received[0]).toMatchObject({
        method: 'GET',
        body: '',
      });
    });
  });

  describe('credentials across a redirect', () => {
    it('drops them when the hop leaves the origin', async () => {
      const destination = await startServer();
      const start = await startServer();
      start.respondWith(
        redirectTo(307, `http://127.0.0.1:${destination.port}/landed`),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: async () => undefined,
      });

      await guarded(`http://localhost:${start.port}/start`, {
        headers: { authorization: 'Bearer secret', cookie: 'session=secret' },
      });

      expect(start.received[0]?.headers.authorization).toBe('Bearer secret');
      expect(destination.received[0]?.headers.authorization).toBeUndefined();
      expect(destination.received[0]?.headers.cookie).toBeUndefined();
    });

    it('keeps them when the hop stays on the origin', async () => {
      const server = await startServer();
      const origin = `http://localhost:${server.port}`;
      server.respondWith((request, response) => {
        if (request.url === '/start') {
          response.writeHead(307, { location: `${origin}/landed` });
          response.end();
        } else {
          response.writeHead(200);
          response.end('landed');
        }
      });
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await guarded(`${origin}/start`, {
        headers: { authorization: 'Bearer secret' },
      });

      expect(server.received[1]?.headers.authorization).toBe('Bearer secret');
    });
  });

  describe('abort', () => {
    it('propagates through a redirect hop', async () => {
      const hang = await startServer();
      hang.respondWith(() => {
        // Never answers, so the abort has something to interrupt.
      });
      const start = await startServer();
      start.respondWith(
        redirectTo(302, `http://localhost:${hang.port}/forever`),
      );
      const controller = new AbortController();
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: async (url) => {
          if (url.pathname === '/forever') {
            controller.abort();
          }
        },
      });

      await expect(
        guarded(`http://localhost:${start.port}/start`, {
          signal: controller.signal,
        }),
      ).rejects.toThrow(/abort/iu);
    });

    it('propagates from a Request through a redirect hop', async () => {
      const hang = await startServer();
      hang.respondWith(() => {
        // Never answers.
      });
      const start = await startServer();
      start.respondWith(
        redirectTo(302, `http://localhost:${hang.port}/forever`),
      );
      const controller = new AbortController();
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: async (url) => {
          if (url.pathname === '/forever') {
            controller.abort();
          }
        },
      });

      await expect(
        guarded(
          new Request(`http://localhost:${start.port}/start`, {
            signal: controller.signal,
          }),
        ),
      ).rejects.toThrow(/abort/iu);
    });
  });

  describe('a Request input', () => {
    it('keeps its method, headers and body', async () => {
      const server = await startServer();
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await guarded(
        new Request(`http://localhost:${server.port}/thing`, {
          method: 'POST',
          body: 'from a request',
          headers: { 'x-marker': 'kept' },
        }),
      );

      expect(server.received[0]).toMatchObject({
        method: 'POST',
        body: 'from a request',
      });
      expect(server.received[0]?.headers['x-marker']).toBe('kept');
    });

    it('is overridden by an init that names the same thing', async () => {
      const server = await startServer();
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await guarded(
        new Request(`http://localhost:${server.port}/thing`, {
          method: 'POST',
          body: 'from a request',
        }),
        { method: 'PUT', body: 'from an init' },
      );

      expect(server.received[0]).toMatchObject({
        method: 'PUT',
        body: 'from an init',
      });
    });

    it('carries its body to a hop that keeps it only if it can be replayed', async () => {
      const destination = await startServer();
      const start = await startServer();
      start.respondWith(
        redirectTo(307, `http://localhost:${destination.port}/landed`),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      // A `Request`'s body is a stream whatever it was built from, and the
      // bytes behind it are not reachable a second time.
      await expect(
        guarded(
          new Request(`http://localhost:${start.port}/start`, {
            method: 'POST',
            body: 'from a request',
          }),
        ),
      ).rejects.toThrow(/cannot be sent a second time/u);
      expect(destination.received).toStrictEqual([]);
    });
  });

  describe('with a scripted fetch', () => {
    /**
     * Reply with each response in turn, so a hop's exact arguments can be
     * inspected without a server in the way.
     *
     * @param responses - What to answer each successive call with.
     * @returns The scripted fetch.
     */
    const scriptFetch = (...responses: Response[]): typeof fetch => {
      const remaining = [...responses];
      return vi.fn(async () => remaining.shift() as Response) as typeof fetch;
    };

    it('discards the body of a redirect it does not return', async () => {
      let cancelled = false;
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const redirectBody = new ReadableStream({
        cancel: () => {
          cancelled = true;
        },
      });
      const guarded = makeGuardedFetch({
        baseFetch: scriptFetch(
          new Response(redirectBody, {
            status: 302,
            headers: { location: 'http://localhost/landed' },
          }),
          new Response('landed'),
        ),
        guard: allowLocalhost,
      });

      const response = await guarded('http://localhost/start');

      expect(await response.text()).toBe('landed');
      // Unread and unreturned, its connection would be held until collection.
      expect(cancelled).toBe(true);
    });

    it('hands the guard the request each hop will actually make', async () => {
      const guard = vi.fn(allowLocalhost);
      const guarded = makeGuardedFetch({
        baseFetch: scriptFetch(
          new Response('', {
            status: 303,
            headers: { location: 'http://localhost/landed' },
          }),
          new Response('landed'),
        ),
        guard,
      });

      await guarded('http://localhost/start', { method: 'POST', body: 'sent' });

      const [firstUrl, firstInit] = guard.mock.calls[0] as [URL, RequestInit];
      expect(firstUrl).toStrictEqual(new URL('http://localhost/start'));
      expect(firstInit).toMatchObject({
        method: 'POST',
        body: 'sent',
        redirect: 'manual',
      });
      // The 303 rewrote the request, and the guard sees the rewrite.
      const [hopUrl, hopInit] = guard.mock.calls[1] as [URL, RequestInit];
      expect(hopUrl).toStrictEqual(new URL('http://localhost/landed'));
      expect(hopInit).toMatchObject({
        method: 'GET',
        body: null,
        redirect: 'manual',
      });
    });

    it('refuses an opaque redirect, which hides the hop instead of exposing it', async () => {
      // What a browser answers a manual redirect with: no status, no headers,
      // no way to check where it points.
      const opaque = {
        type: 'opaqueredirect',
        status: 0,
        headers: new Headers(),
        body: null,
      } as unknown as Response;
      const baseFetch = scriptFetch(opaque, new Response('landed'));
      const guarded = makeGuardedFetch({ baseFetch, guard: allowLocalhost });

      await expect(guarded('http://localhost/start')).rejects.toThrow(
        /hides the target of a manual redirect/u,
      );
      expect(baseFetch).toHaveBeenCalledTimes(1);
    });

    it('follows the hop even when discarding the redirect body fails', async () => {
      const guarded = makeGuardedFetch({
        baseFetch: scriptFetch(
          new Response('redirecting', {
            status: 302,
            headers: { location: 'http://localhost/landed' },
          }),
          new Response('landed'),
        ),
        guard: allowLocalhost,
      });
      // A body nobody wanted must not be able to fail the request.
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      vi.spyOn(ReadableStream.prototype, 'cancel').mockRejectedValue(
        new Error('already gone'),
      );

      expect(await (await guarded('http://localhost/start')).text()).toBe(
        'landed',
      );
    });

    it('strips credentials on a hop that only changes scheme', async () => {
      const guard = vi.fn(async () => undefined);
      const guarded = makeGuardedFetch({
        baseFetch: scriptFetch(
          new Response('', {
            status: 307,
            headers: { location: 'http://example.test/landed' },
          }),
          new Response('landed'),
        ),
        guard,
      });

      await guarded('https://example.test/start', {
        headers: { authorization: 'Bearer secret' },
      });

      const [, hopInit] = guard.mock.calls[1] as unknown as [URL, RequestInit];
      expect((hopInit.headers as Headers).get('authorization')).toBeNull();
    });

    it('carries a Request’s integrity to the hop, where it is still enforced', async () => {
      const guard = vi.fn(allowLocalhost);
      const guarded = makeGuardedFetch({
        baseFetch: scriptFetch(
          new Response('', {
            status: 307,
            headers: { location: 'http://localhost/landed' },
          }),
          new Response('landed'),
        ),
        guard,
      });

      await guarded(
        new Request('http://localhost/start', { integrity: 'sha256-abc' }),
      );

      const [, hopInit] = guard.mock.calls[1] as unknown as [URL, RequestInit];
      expect(hopInit.integrity).toBe('sha256-abc');
    });

    it('shows the guard the headers it will send, not ones changed since', async () => {
      const headers = new Headers({ 'x-marker': 'before' });
      const baseFetch = scriptFetch(new Response('landed'));
      const guarded = makeGuardedFetch({
        baseFetch,
        guard: async () => {
          // The caller still holds its own header object, and the guard is
          // async, so it has a turn in which to change it.
          headers.set('x-marker', 'after');
        },
      });

      await guarded('http://localhost/start', { headers });

      const [, sentInit] = (baseFetch as ReturnType<typeof vi.fn>).mock
        .calls[0] as [unknown, RequestInit];
      expect((sentInit.headers as Headers).get('x-marker')).toBe('before');
    });

    it('never lets the caller’s own input reach a hop', async () => {
      const baseFetch = scriptFetch(
        new Response('', {
          status: 307,
          headers: { location: 'http://localhost/landed' },
        }),
        new Response('landed'),
      );
      const guarded = makeGuardedFetch({ baseFetch, guard: allowLocalhost });

      await guarded(new Request('http://localhost/start'));

      const [hopInput] = (baseFetch as ReturnType<typeof vi.fn>).mock
        .calls[1] as [unknown];
      expect(hopInput).toBe('http://localhost/landed');
    });
  });

  describe('a Location the guard must not be able to misread', () => {
    it.each([
      { label: 'protocol-relative', location: '//127.0.0.1:PORT/secrets' },
      {
        label: 'userinfo confusion',
        location: 'http://localhost@127.0.0.1:PORT/secrets',
      },
      {
        label: 'decimal IPv4 literal',
        location: 'http://2130706433:PORT/secrets',
      },
      {
        label: 'trailing-dot host',
        location: 'http://127.0.0.1.:PORT/secrets',
      },
    ])('refuses a $label hop', async ({ location }) => {
      const forbidden = await startServer();
      const allowed = await startServer();
      allowed.respondWith(
        redirectTo(302, location.replace('PORT', String(forbidden.port))),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await expect(
        guarded(`http://localhost:${allowed.port}/start`),
      ).rejects.toThrow('Invalid host:');
      expect(forbidden.received).toStrictEqual([]);
    });

    it.each([
      'data:text/plain,x',
      'file:///etc/passwd',
      'blob:https://example.test/abc',
    ])('refuses a hop to %s by naming its scheme', async (location) => {
      const server = await startServer();
      server.respondWith(redirectTo(302, location));
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await expect(
        guarded(`http://localhost:${server.port}/start`),
      ).rejects.toThrow(/which a guarded fetch will not follow/u);
      expect(server.received).toHaveLength(1);
    });

    it('hands back an empty Location rather than requesting the same URL again', async () => {
      const server = await startServer();
      server.respondWith(redirectTo(302, '   '));
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      const response = await guarded(`http://localhost:${server.port}/start`);

      expect(response.status).toBe(302);
      expect(server.received).toHaveLength(1);
    });

    it('refuses a Location that will not parse', async () => {
      const server = await startServer();
      server.respondWith(redirectTo(302, 'http://['));
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await expect(
        guarded(`http://localhost:${server.port}/start`),
      ).rejects.toThrow(/redirected to an unusable location/u);
      expect(server.received).toHaveLength(1);
    });
  });

  describe('the origin comparison that decides credential stripping', () => {
    it('treats a different hostname on the same port as a different origin', async () => {
      const server = await startServer();
      server.respondWith((request, response) => {
        if (request.url === '/start') {
          // The same server under a name the allowlist also permits, so the
          // hostname is the only part of the origin that differs.
          response.writeHead(307, {
            location: `http://127.0.0.1:${server.port}/landed`,
          });
          response.end();
        } else {
          response.writeHead(200);
          response.end('landed');
        }
      });
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: async () => undefined,
      });

      await guarded(`http://localhost:${server.port}/start`, {
        headers: { authorization: 'Bearer secret' },
      });

      expect(server.received[1]?.headers.authorization).toBeUndefined();
    });

    it('treats a different port on the same hostname as a different origin', async () => {
      const destination = await startServer();
      const start = await startServer();
      start.respondWith(
        redirectTo(307, `http://localhost:${destination.port}/landed`),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      await guarded(`http://localhost:${start.port}/start`, {
        headers: { authorization: 'Bearer secret' },
      });

      expect(destination.received[0]?.headers.authorization).toBeUndefined();
    });

    it.each(['proxy-authorization', 'cookie', 'authorization'])(
      'drops %s across origins',
      async (header) => {
        const destination = await startServer();
        const start = await startServer();
        start.respondWith(
          redirectTo(307, `http://127.0.0.1:${destination.port}/landed`),
        );
        const guarded = makeGuardedFetch({
          baseFetch: fetch,
          guard: async () => undefined,
        });

        await guarded(`http://localhost:${start.port}/start`, {
          headers: { [header]: 'secret' },
        });

        expect(destination.received[0]?.headers[header]).toBeUndefined();
      },
    );
  });

  describe('a Request input carried across a hop', () => {
    it('keeps its method and headers, less the credentials the hop leaves behind', async () => {
      const destination = await startServer();
      const start = await startServer();
      start.respondWith(
        redirectTo(307, `http://127.0.0.1:${destination.port}/landed`),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: async () => undefined,
      });

      await guarded(
        new Request(`http://localhost:${start.port}/start`, {
          method: 'DELETE',
          headers: { authorization: 'Bearer secret', 'x-marker': 'kept' },
        }),
      );

      expect(destination.received[0]?.method).toBe('DELETE');
      expect(destination.received[0]?.headers['x-marker']).toBe('kept');
      expect(destination.received[0]?.headers.authorization).toBeUndefined();
    });

    it('is not emptied by an init body of null, which means "not supplied"', async () => {
      const destination = await startServer();
      const start = await startServer();
      start.respondWith(
        redirectTo(307, `http://localhost:${destination.port}/landed`),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      // The Request's body still stands, so the hop that keeps it is refused
      // rather than sent on with nothing in it.
      await expect(
        guarded(
          new Request(`http://localhost:${start.port}/start`, {
            method: 'POST',
            body: 'payload',
          }),
          { body: null },
        ),
      ).rejects.toThrow(/cannot be sent a second time/u);
      expect(destination.received).toStrictEqual([]);
    });
  });

  describe('bodies that survive a hop', () => {
    it.each([
      { label: 'a string', makeBody: () => 'payload' },
      {
        label: 'URLSearchParams',
        makeBody: () => new URLSearchParams({ a: 'b' }),
      },
      { label: 'a Blob', makeBody: () => new Blob(['payload']) },
      {
        label: 'an ArrayBuffer view',
        makeBody: () => new TextEncoder().encode('payload'),
      },
      {
        label: 'FormData',
        makeBody: () => {
          const form = new FormData();
          form.append('a', 'b');
          return form;
        },
      },
    ])('replays $label across a 307', async ({ makeBody }) => {
      const destination = await startServer();
      const start = await startServer();
      start.respondWith(
        redirectTo(307, `http://localhost:${destination.port}/landed`),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      const response = await guarded(`http://localhost:${start.port}/start`, {
        method: 'POST',
        body: makeBody() as RequestInit['body'],
      });

      expect(await response.text()).toBe('landed');
      expect(destination.received[0]?.method).toBe('POST');
      expect(destination.received[0]?.body).not.toBe('');
    });
  });

  describe('the response of a followed chain', () => {
    it('clones as a redirected response', async () => {
      const second = await startServer();
      const first = await startServer();
      first.respondWith(
        redirectTo(302, `http://localhost:${second.port}/landed`),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      const response = await guarded(`http://localhost:${first.port}/start`);
      const clone = response.clone();

      expect(clone.redirected).toBe(true);
      expect(clone.url).toBe(`http://localhost:${second.port}/landed`);
      expect(await clone.text()).toBe('landed');
      expect(await response.text()).toBe('landed');
    });

    it('is still a Response, headers and all', async () => {
      const second = await startServer();
      second.respondWith((_request, response) => {
        response.writeHead(201, { 'x-marker': 'final' });
        response.end('landed');
      });
      const first = await startServer();
      first.respondWith(
        redirectTo(302, `http://localhost:${second.port}/landed`),
      );
      const guarded = makeGuardedFetch({
        baseFetch: fetch,
        guard: allowLocalhost,
      });

      const response = await guarded(`http://localhost:${first.port}/start`);

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(201);
      expect(response.ok).toBe(true);
      expect(response.headers.get('x-marker')).toBe('final');
      expect(response.bodyUsed).toBe(false);
      expect(await response.text()).toBe('landed');
      expect(response.bodyUsed).toBe(true);
    });

    it('reports redirected through a frozen response, which cannot be written to', async () => {
      const second = await startServer();
      const first = await startServer();
      first.respondWith(
        redirectTo(302, `http://localhost:${second.port}/landed`),
      );
      const guarded = makeGuardedFetch({
        // Stands in for the vat `fetch` endowment, which hardens what it
        // returns before the caveat ever sees it.
        baseFetch: async (input, init) =>
          Object.freeze(await fetch(input, init)),
        guard: allowLocalhost,
      });

      const response = await guarded(`http://localhost:${first.port}/start`);

      expect(response.redirected).toBe(true);
      expect(await response.text()).toBe('landed');
    });
  });
});
