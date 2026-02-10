import { describe, it, expect, vi, beforeEach } from 'vitest';

import { handleView } from './view.ts';

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

describe('handleView', () => {
  let logger: ReturnType<typeof makeLogger>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = makeLogger();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  it('writes all categories as a single JSON object to stdout', async () => {
    mockCall.mockResolvedValue([
      { key: 'ko1', value: 'obj-val-1' },
      { key: 'ko2', value: 'obj-val-2' },
      { key: 'kp1', value: 'prom-val-1' },
      { key: 'v1', value: 'vat-val-1' },
      { key: 'v2', value: 'vat-val-2' },
      { key: 'other', value: 'ignored' },
    ]);

    await handleView(mockGetMethodSpecs, logger as never);

    expect(mockCall).toHaveBeenCalledWith('executeDBQuery', {
      sql: 'SELECT key, value FROM kv',
    });

    const output = JSON.parse((stdoutSpy.mock.calls[0] as [string])[0]);
    expect(output).toStrictEqual({
      objects: { ko1: 'obj-val-1', ko2: 'obj-val-2' },
      promises: { kp1: 'prom-val-1' },
      vats: { v1: 'vat-val-1', v2: 'vat-val-2' },
    });
    expect(mockClose).toHaveBeenCalled();
  });

  it('produces empty categories when DB has no matching entries', async () => {
    mockCall.mockResolvedValue([]);

    await handleView(mockGetMethodSpecs, logger as never);

    const output = JSON.parse((stdoutSpy.mock.calls[0] as [string])[0]);
    expect(output).toStrictEqual({
      objects: {},
      promises: {},
      vats: {},
    });
    expect(mockClose).toHaveBeenCalled();
  });

  it('does not log via logger', async () => {
    mockCall.mockResolvedValue([{ key: 'ko1', value: 'val' }]);

    await handleView(mockGetMethodSpecs, logger as never);

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('closes the daemon connection on error', async () => {
    mockCall.mockRejectedValue(new Error('connection failed'));

    await expect(
      handleView(mockGetMethodSpecs, logger as never),
    ).rejects.toThrow('connection failed');

    expect(mockClose).toHaveBeenCalled();
  });
});
