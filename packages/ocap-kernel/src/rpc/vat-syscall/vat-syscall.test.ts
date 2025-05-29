import { describe, it, expect, vi } from 'vitest';

import { vatSyscallHandler } from './vat-syscall.ts';

describe('vatSyscallHandler', () => {
  it('should initialize a vat', async () => {
    const handleSyscall = vi.fn();
    await vatSyscallHandler.implementation({ handleSyscall }, [
      'send',
      'test',
      {
        methargs: { body: 'test', slots: [] },
        result: null,
      },
    ]);

    expect(handleSyscall).toHaveBeenCalledTimes(1);
    expect(handleSyscall).toHaveBeenCalledWith([
      'send',
      'test',
      {
        methargs: { body: 'test', slots: [] },
        result: null,
      },
    ]);
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
