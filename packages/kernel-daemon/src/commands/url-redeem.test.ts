import { describe, it, expect, vi, beforeEach } from 'vitest';

import { handleUrlRedeem } from './url-redeem.ts';

const { mockCall, mockClose } = vi.hoisted(() => ({
  mockCall: vi.fn(),
  mockClose: vi.fn(),
}));

vi.mock('../daemon-client.ts', () => ({
  connectToDaemon: vi.fn().mockReturnValue({
    client: { call: mockCall },
    close: mockClose,
  }),
}));

const makeLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

const mockGetMethodSpecs = vi.fn().mockResolvedValue({});

describe('handleUrlRedeem', () => {
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = makeLogger();
  });

  it('calls redeemOcapURL RPC with the given url and logs the result', async () => {
    mockCall.mockResolvedValue('ko42');

    await handleUrlRedeem(
      'ocap://peer123/ko1',
      mockGetMethodSpecs,
      logger as never,
    );

    expect(mockCall).toHaveBeenCalledWith('redeemOcapURL', {
      url: 'ocap://peer123/ko1',
    });
    expect(logger.info).toHaveBeenCalledWith('ko42');
    expect(mockClose).toHaveBeenCalled();
  });

  it('closes the connection on error', async () => {
    mockCall.mockRejectedValue(new Error('Invalid OCAP URL'));

    await expect(
      handleUrlRedeem('ocap://bad', mockGetMethodSpecs, logger as never),
    ).rejects.toThrow('Invalid OCAP URL');

    expect(mockClose).toHaveBeenCalled();
  });
});
