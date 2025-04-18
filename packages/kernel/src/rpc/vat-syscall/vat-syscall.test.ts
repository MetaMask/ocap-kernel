import { describe, it, expect, vi } from 'vitest';

import { vatSyscallHandler } from './vat-syscall.ts';
import type { HandleSyscall } from './vat-syscall.ts';

describe('vatSyscallHandler', () => {
  it('should initialize a vat', async () => {
    const handleSyscall = vi.fn(async () =>
      Promise.resolve({
        checkpoint: 'fake',
      }),
    ) as unknown as HandleSyscall;
    const result = await vatSyscallHandler.implementation({ handleSyscall }, [
      'send',
      'test',
      {
        methargs: { body: 'test', slots: [] },
        result: null,
      },
    ]);
    expect(result).toStrictEqual({
      checkpoint: 'fake',
    });
  });

  it('should propagate errors from hooks', async () => {
    const handleSyscall = vi.fn(() => {
      throw new Error('fake');
    });
    await expect(
      vatSyscallHandler.implementation({ handleSyscall }, [
        'send',
        'test',
        {
          methargs: { body: 'test', slots: [] },
          result: null,
        },
      ]),
    ).rejects.toThrow('fake');
  });
});
