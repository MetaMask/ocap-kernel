import { describe, it, expect, vi } from 'vitest';

import type { InvocationKernel } from './url-invocation.ts';
import { handleURLInvocation } from './url-invocation.ts';

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
      .mockResolvedValue({ body: '{"result":"ok"}', slots: [] }),
    issueOcapURL: vi
      .fn<[string], Promise<string>>()
      .mockImplementation(async (kref) => `ocap:encrypted-${kref}@host`),
    ...overrides,
  };
}

describe('handleURLInvocation', () => {
  it('redeems URL, invokes method, and returns result', async () => {
    const kernel = makeMockKernel();
    const url = 'ocap:oid@host?method=ping&args=%5B%5D';

    const result = await handleURLInvocation(url, kernel);

    expect(kernel.redeemOcapURL).toHaveBeenCalledWith('ocap:oid@host');
    expect(kernel.queueMessage).toHaveBeenCalledWith('ko1', 'ping', []);
    expect(result).toStrictEqual({ body: '{"result":"ok"}', slots: [] });
  });

  it('passes args from the URL to queueMessage', async () => {
    const kernel = makeMockKernel();
    const url = 'ocap:oid@host?method=transfer&args=%5B42%2C%22bob%22%5D';

    await handleURLInvocation(url, kernel);

    expect(kernel.queueMessage).toHaveBeenCalledWith('ko1', 'transfer', [
      42,
      'bob',
    ]);
  });

  it('defaults args to empty array when absent', async () => {
    const kernel = makeMockKernel();
    const url = 'ocap:oid@host?method=status';

    await handleURLInvocation(url, kernel);

    expect(kernel.queueMessage).toHaveBeenCalledWith('ko1', 'status', []);
  });

  it('replaces kref slots with OCAP URLs', async () => {
    const kernel = makeMockKernel({
      queueMessage: vi.fn().mockResolvedValue({
        body: '{"handler":"#0","backup":"#1"}',
        slots: ['ko5', 'ko9'],
      }),
    });
    const url = 'ocap:oid@host?method=getHandlers&args=%5B%5D';

    const result = await handleURLInvocation(url, kernel);

    expect(kernel.issueOcapURL).toHaveBeenCalledWith('ko5');
    expect(kernel.issueOcapURL).toHaveBeenCalledWith('ko9');
    expect(result.slots).toStrictEqual([
      'ocap:encrypted-ko5@host',
      'ocap:encrypted-ko9@host',
    ]);
  });

  it('throws when method parameter is missing', async () => {
    const kernel = makeMockKernel();
    const url = 'ocap:oid@host';

    await expect(handleURLInvocation(url, kernel)).rejects.toThrow(
      'invocation URL missing method parameter',
    );
  });

  it('propagates kernel.redeemOcapURL errors', async () => {
    const kernel = makeMockKernel({
      redeemOcapURL: vi
        .fn()
        .mockRejectedValue(Error('ocapURL has bad object reference')),
    });
    const url = 'ocap:bad@host?method=ping&args=%5B%5D';

    await expect(handleURLInvocation(url, kernel)).rejects.toThrow(
      'ocapURL has bad object reference',
    );
  });

  it('propagates kernel.queueMessage errors', async () => {
    const kernel = makeMockKernel({
      queueMessage: vi.fn().mockRejectedValue(Error('method not found')),
    });
    const url = 'ocap:oid@host?method=bogus&args=%5B%5D';

    await expect(handleURLInvocation(url, kernel)).rejects.toThrow(
      'method not found',
    );
  });
});
