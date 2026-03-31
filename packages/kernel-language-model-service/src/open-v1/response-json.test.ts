import { describe, expect, it, vi } from 'vitest';

import { checkResponseOk, readAndCheckResponse } from './response-json.ts';

describe('readAndCheckResponse', () => {
  it('returns body text when response is ok', async () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => Promise.resolve('{"x":1}'),
    } as Response;
    expect(await readAndCheckResponse(response)).toBe('{"x":1}');
  });

  it('throws with status and body snippet when response is not ok', async () => {
    const response = {
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => Promise.resolve('upstream down'),
    } as Response;
    await expect(readAndCheckResponse(response)).rejects.toThrow(
      'HTTP 503 Service Unavailable — upstream down',
    );
  });
});

describe('checkResponseOk', () => {
  it('resolves without reading the body when ok', async () => {
    const text = vi.fn();
    const response = { ok: true, text } as unknown as Response;
    await checkResponseOk(response);
    expect(text).not.toHaveBeenCalled();
  });

  it('reads body and throws when not ok', async () => {
    const response = {
      ok: false,
      status: 500,
      statusText: 'Error',
      text: async () => Promise.resolve('fail'),
    } as Response;
    await expect(checkResponseOk(response)).rejects.toThrow(
      'HTTP 500 Error — fail',
    );
  });
});
