import type { CapData } from '@endo/marshal';
import type { Kernel } from '@metamask/ocap-kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { queueMessageSpec, queueMessageHandler } from './queue-message.ts';

describe('queueMessageSpec', () => {
  it('should define the correct method name', () => {
    expect(queueMessageSpec.method).toBe('queueMessage');
  });

  it('should define the correct parameter structure', () => {
    // Valid parameters should pass validation
    const validParams = [
      'target123',
      'methodName',
      [1, 'string', { key: 'value' }],
    ];
    expect(() => queueMessageSpec.params.create(validParams)).not.toThrow();

    // Invalid parameters should fail validation
    const invalidParams = ['target123', 123, [1, 'string']];
    expect(() => queueMessageSpec.params.create(invalidParams)).toThrow(
      'Expected a string',
    );
  });

  it('should define the correct result structure', () => {
    // Valid result should pass validation
    const validResult: CapData<string> = { body: 'result', slots: [] };
    expect(() => queueMessageSpec.result.create(validResult)).not.toThrow();

    // Invalid result should fail validation
    const invalidResult = 'not a CapData object';
    expect(() => queueMessageSpec.result.create(invalidResult)).toThrow(
      'Expected an object',
    );
  });
});

describe('queueMessageHandler', () => {
  let mockKernel: Pick<Kernel, 'queueMessage'>;

  beforeEach(() => {
    mockKernel = {
      queueMessage: vi.fn(),
    };
  });

  it('should correctly forward arguments to kernel.queueMessage', async () => {
    const target = 'targetId';
    const method = 'methodName';
    const args = [1, 'string', { key: 'value' }];
    const expectedResult: CapData<string> = { body: 'result', slots: [] };

    vi.mocked(mockKernel.queueMessage).mockResolvedValueOnce(expectedResult);

    const result = await queueMessageHandler.implementation(
      { kernel: mockKernel },
      [target, method, args],
    );

    expect(mockKernel.queueMessage).toHaveBeenCalledWith(target, method, args);
    expect(result).toStrictEqual(expectedResult);
  });

  it('should propagate errors from kernel.queueMessage', async () => {
    const error = new Error('Queue message failed');
    vi.mocked(mockKernel.queueMessage).mockRejectedValueOnce(error);

    await expect(
      queueMessageHandler.implementation({ kernel: mockKernel }, [
        'target',
        'method',
        [],
      ]),
    ).rejects.toThrow('Queue message failed');
  });
});
