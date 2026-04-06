import { describe, it, expect } from 'vitest';

import {
  KERNEL_ERROR_PATTERN,
  isKernelError,
  getKernelErrorCode,
  isFatalKernelError,
} from './vat-observable-errors.ts';

describe('KERNEL_ERROR_PATTERN', () => {
  it.each([
    ['[KERNEL:OBJECT_REVOKED] Target object has been revoked', true],
    ['[KERNEL:VAT_FATAL:ILLEGAL_SYSCALL] Fatal syscall violation', true],
    ['[KERNEL:CONNECTION_LOST] Remote connection lost', true],
    ['Some other error', false],
    ['KERNEL:OBJECT_REVOKED', false],
    ['[KERNEL:lowercase] bad code', false],
  ])('matches %j -> %j', (message, expected) => {
    expect(KERNEL_ERROR_PATTERN.test(message)).toBe(expected);
  });
});

describe('isKernelError', () => {
  it('returns true for an Error with a kernel error message', () => {
    expect(isKernelError(Error('[KERNEL:OBJECT_DELETED] Target deleted'))).toBe(
      true,
    );
  });

  it('returns true for a fatal kernel error', () => {
    expect(
      isKernelError(Error('[KERNEL:VAT_FATAL:INTERNAL_ERROR] Something broke')),
    ).toBe(true);
  });

  it('returns false for a plain Error', () => {
    expect(isKernelError(Error('just a normal error'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isKernelError('string')).toBe(false);
    expect(isKernelError(null)).toBe(false);
    expect(isKernelError(undefined)).toBe(false);
    expect(isKernelError(42)).toBe(false);
  });
});

describe('getKernelErrorCode', () => {
  it('extracts expected error codes', () => {
    expect(getKernelErrorCode(Error('[KERNEL:OBJECT_REVOKED] revoked'))).toBe(
      'OBJECT_REVOKED',
    );
    expect(getKernelErrorCode(Error('[KERNEL:CONNECTION_LOST] lost'))).toBe(
      'CONNECTION_LOST',
    );
  });

  it('extracts fatal error codes', () => {
    expect(
      getKernelErrorCode(Error('[KERNEL:VAT_FATAL:ILLEGAL_SYSCALL] bad')),
    ).toBe('ILLEGAL_SYSCALL');
    expect(
      getKernelErrorCode(Error('[KERNEL:VAT_FATAL:INTERNAL_ERROR] broken')),
    ).toBe('INTERNAL_ERROR');
  });

  it('returns undefined for non-kernel errors', () => {
    expect(getKernelErrorCode(Error('normal error'))).toBeUndefined();
  });
});

describe('isFatalKernelError', () => {
  it('returns true for fatal kernel errors', () => {
    expect(
      isFatalKernelError(
        Error('[KERNEL:VAT_FATAL:ILLEGAL_SYSCALL] bad syscall'),
      ),
    ).toBe(true);
  });

  it('returns false for expected kernel errors', () => {
    expect(isFatalKernelError(Error('[KERNEL:OBJECT_REVOKED] revoked'))).toBe(
      false,
    );
  });

  it('returns false for non-kernel errors', () => {
    expect(isFatalKernelError(Error('normal error'))).toBe(false);
  });
});

describe('round-trip', () => {
  it('constructs and detects a kernel error message', () => {
    const code = 'OBJECT_DELETED';
    const detail = 'Target object has no owner; it may have been deleted';
    const message = `[KERNEL:${code}] ${detail}`;
    const error = Error(message);

    expect(isKernelError(error)).toBe(true);
    expect(getKernelErrorCode(error)).toBe(code);
    expect(isFatalKernelError(error)).toBe(false);
    expect(error.message).toBe(`[KERNEL:OBJECT_DELETED] ${detail}`);
  });

  it('constructs and detects a fatal kernel error message', () => {
    const code = 'INTERNAL_ERROR';
    const detail = 'Internal kernel error';
    const message = `[KERNEL:VAT_FATAL:${code}] ${detail}`;
    const error = Error(message);

    expect(isKernelError(error)).toBe(true);
    expect(getKernelErrorCode(error)).toBe(code);
    expect(isFatalKernelError(error)).toBe(true);
  });
});
