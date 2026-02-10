import { describe, it, expect, vi, beforeEach } from 'vitest';

import { handleInspect } from './inspect.ts';

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

/**
 * Build a mock capdata result with a smallcaps-encoded body.
 *
 * @param value - The value to encode.
 * @returns A capdata object with body and slots.
 */
function makeCapData(value: unknown) {
  return { body: `#${JSON.stringify(value)}`, slots: [] };
}

describe('handleInspect', () => {
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = makeLogger();
  });

  it('returns all keys when object has methods, guard, and describe', async () => {
    const methodNames = [
      'hello',
      'describe',
      '__getMethodNames__',
      '__getInterfaceGuard__',
    ];
    const guard = { methods: { hello: {} } };
    const schema = { hello: { description: 'says hello' } };

    mockCall
      .mockResolvedValueOnce(makeCapData(methodNames))
      .mockResolvedValueOnce(makeCapData(guard))
      .mockResolvedValueOnce(makeCapData(schema));

    await handleInspect('ko1', mockGetMethodSpecs, logger as never);

    expect(mockCall).toHaveBeenCalledTimes(3);
    expect(mockCall).toHaveBeenNthCalledWith(1, 'queueMessage', [
      'ko1',
      '__getMethodNames__',
      [],
    ]);
    expect(mockCall).toHaveBeenNthCalledWith(2, 'queueMessage', [
      'ko1',
      '__getInterfaceGuard__',
      [],
    ]);
    expect(mockCall).toHaveBeenNthCalledWith(3, 'queueMessage', [
      'ko1',
      'describe',
      [],
    ]);

    const logged = JSON.parse(logger.info.mock.calls[0][0] as string);
    expect(logged).toStrictEqual({
      methodNames,
      interfaceGuard: guard,
      schema,
    });
    expect(mockClose).toHaveBeenCalled();
  });

  it('returns only methodNames when object has no guard or describe', async () => {
    const methodNames = ['hello', '__getMethodNames__'];

    mockCall.mockResolvedValueOnce(makeCapData(methodNames));

    await handleInspect('ko5', mockGetMethodSpecs, logger as never);

    expect(mockCall).toHaveBeenCalledTimes(1);

    const logged = JSON.parse(logger.info.mock.calls[0][0] as string);
    expect(logged).toStrictEqual({ methodNames });
    expect(mockClose).toHaveBeenCalled();
  });

  it('omits interfaceGuard when object has describe but no guard', async () => {
    const methodNames = ['hello', 'describe', '__getMethodNames__'];
    const schema = { hello: { description: 'says hello' } };

    mockCall
      .mockResolvedValueOnce(makeCapData(methodNames))
      .mockResolvedValueOnce(makeCapData(schema));

    await handleInspect('ko3', mockGetMethodSpecs, logger as never);

    expect(mockCall).toHaveBeenCalledTimes(2);
    expect(mockCall).toHaveBeenNthCalledWith(2, 'queueMessage', [
      'ko3',
      'describe',
      [],
    ]);

    const logged = JSON.parse(logger.info.mock.calls[0][0] as string);
    expect(logged).toStrictEqual({ methodNames, schema });
    expect(logged).not.toHaveProperty('interfaceGuard');
    expect(mockClose).toHaveBeenCalled();
  });

  it('closes the connection on error', async () => {
    mockCall.mockRejectedValue(new Error('connection failed'));

    await expect(
      handleInspect('ko1', mockGetMethodSpecs, logger as never),
    ).rejects.toThrow('connection failed');

    expect(mockClose).toHaveBeenCalled();
  });
});
