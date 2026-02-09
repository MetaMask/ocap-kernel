import { describe, it, expect, vi, beforeEach } from 'vitest';

import { handleUrlIssue } from './url-issue.ts';

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

describe('handleUrlIssue', () => {
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = makeLogger();
  });

  it('calls issueOcapURL RPC with the given kref and logs the result', async () => {
    mockCall.mockResolvedValue('ocap://peer123/ko1');

    await handleUrlIssue('ko1', mockGetMethodSpecs, logger as never);

    expect(mockCall).toHaveBeenCalledWith('issueOcapURL', { kref: 'ko1' });
    expect(logger.info).toHaveBeenCalledWith('ocap://peer123/ko1');
    expect(mockClose).toHaveBeenCalled();
  });

  it('closes the connection on error', async () => {
    mockCall.mockRejectedValue(new Error('Remote comms not initialized'));

    await expect(
      handleUrlIssue('ko1', mockGetMethodSpecs, logger as never),
    ).rejects.toThrow('Remote comms not initialized');

    expect(mockClose).toHaveBeenCalled();
  });
});
