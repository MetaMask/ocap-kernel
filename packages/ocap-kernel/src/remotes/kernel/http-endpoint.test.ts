import http from 'node:http';
import { afterEach, describe, it, expect, vi } from 'vitest';

import { createHTTPInvocationServer } from './http-endpoint.ts';
import type { InvocationKernel } from './url-invocation.ts';

function makeMockKernel(
  overrides: Partial<InvocationKernel> = {},
): InvocationKernel {
  return {
    redeemOcapURL: vi.fn<[string], Promise<string>>().mockResolvedValue('ko1'),
    queueMessage: vi
      .fn<
        [string, string, unknown[]],
        Promise<{ body: string; slots: string[] }>
      >()
      .mockResolvedValue({ body: '"pong"', slots: [] }),
    issueOcapURL: vi
      .fn<[string], Promise<string>>()
      .mockImplementation(async (kref) => `ocap:enc-${kref}@host`),
    ...overrides,
  };
}

async function httpRequest(
  port: number,
  method: string,
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
          });
        });
      },
    );
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function postJSON(
  port: number,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await httpRequest(port, 'POST', JSON.stringify(body));
  return { status: response.status, body: JSON.parse(response.body) };
}

describe('createHTTPInvocationServer', () => {
  let closeFn: (() => Promise<void>) | undefined;

  afterEach(async () => {
    const cleanup = closeFn;
    closeFn = undefined;
    await cleanup?.();
  });

  it('returns invocation result for a valid POST', async () => {
    const kernel = makeMockKernel();
    const httpServer = createHTTPInvocationServer(kernel);
    const handle = await httpServer.listen(0);
    closeFn = handle.close;

    const response = await postJSON(handle.port, {
      url: 'ocap:oid@host?method=ping&args=%5B%5D',
    });

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({ body: '"pong"', slots: [] });
  });

  it('rejects non-POST requests', async () => {
    const kernel = makeMockKernel();
    const httpServer = createHTTPInvocationServer(kernel);
    const handle = await httpServer.listen(0);
    closeFn = handle.close;

    const response = await httpRequest(handle.port, 'GET');

    expect(response.status).toBe(405);
    expect(JSON.parse(response.body)).toStrictEqual({
      error: 'Method not allowed',
    });
  });

  it('rejects invalid JSON body', async () => {
    const kernel = makeMockKernel();
    const httpServer = createHTTPInvocationServer(kernel);
    const handle = await httpServer.listen(0);
    closeFn = handle.close;

    const response = await httpRequest(handle.port, 'POST', 'not json');

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toStrictEqual({
      error: 'Invalid JSON',
    });
  });

  it('rejects missing url field', async () => {
    const kernel = makeMockKernel();
    const httpServer = createHTTPInvocationServer(kernel);
    const handle = await httpServer.listen(0);
    closeFn = handle.close;

    const response = await postJSON(handle.port, { notUrl: 'something' });

    expect(response.status).toBe(400);
    expect(response.body).toStrictEqual({
      error: 'Missing or invalid "url" field',
    });
  });

  it('returns 500 with error message on invocation failure', async () => {
    const kernel = makeMockKernel({
      redeemOcapURL: vi
        .fn()
        .mockRejectedValue(Error('ocapURL has bad object reference')),
    });
    const httpServer = createHTTPInvocationServer(kernel);
    const handle = await httpServer.listen(0);
    closeFn = handle.close;

    const response = await postJSON(handle.port, {
      url: 'ocap:bad@host?method=ping&args=%5B%5D',
    });

    expect(response.status).toBe(500);
    expect(response.body).toStrictEqual({
      error: 'ocapURL has bad object reference',
    });
  });

  it('replaces kref slots with OCAP URLs in response', async () => {
    const kernel = makeMockKernel({
      queueMessage: vi.fn().mockResolvedValue({
        body: '{"ref":"#0"}',
        slots: ['ko7'],
      }),
    });
    const httpServer = createHTTPInvocationServer(kernel);
    const handle = await httpServer.listen(0);
    closeFn = handle.close;

    const response = await postJSON(handle.port, {
      url: 'ocap:oid@host?method=getRef&args=%5B%5D',
    });

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      body: '{"ref":"#0"}',
      slots: ['ocap:enc-ko7@host'],
    });
  });
});
