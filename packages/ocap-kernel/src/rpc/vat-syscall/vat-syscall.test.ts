import { describe, it, expect, vi } from 'vitest';

import { vatSyscallHandler } from './vat-syscall.ts';

describe('vatSyscallHandler', () => {
  it('should initialize a vat', () => {
    const handleSyscall = vi.fn();
    vatSyscallHandler.implementation({ handleSyscall }, [
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

  it('should propagate errors from hooks', () => {
    const handleSyscall = vi.fn(() => {
      throw new Error('fake');
    });
    expect(() =>
      vatSyscallHandler.implementation({ handleSyscall }, [
        'send',
        'test',
        {
          methargs: { body: 'test', slots: [] },
          result: null,
        },
      ]),
    ).toThrow('fake');
  });
});
