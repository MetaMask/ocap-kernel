import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isErrorWithCode,
  isProcessAlive,
  parseTimeoutMs,
  readPidFile,
  sendSignal,
  waitFor,
  withTimeout,
} from './utils.ts';

vi.mock('node:fs/promises');

describe('utils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isErrorWithCode', () => {
    it('returns true for a matching error code', () => {
      const error = Object.assign(new Error('fail'), { code: 'ENOENT' });
      expect(isErrorWithCode(error, 'ENOENT')).toBe(true);
    });

    it('returns false for a non-matching error code', () => {
      const error = Object.assign(new Error('fail'), { code: 'EACCES' });
      expect(isErrorWithCode(error, 'ENOENT')).toBe(false);
    });

    it('returns false for a non-Error value', () => {
      expect(isErrorWithCode('not an error', 'ENOENT')).toBe(false);
    });

    it('returns false for an Error without a code property', () => {
      expect(isErrorWithCode(new Error('fail'), 'ENOENT')).toBe(false);
    });
  });

  describe('withTimeout', () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: Date.now(), toFake: ['setTimeout'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('times out within the specified duration', async () => {
      const duration = 300;
      const timeout = withTimeout(new Promise(() => undefined), duration);
      vi.advanceTimersByTime(duration);
      await expect(async () => await timeout).rejects.toThrow(/timed out/u);
    });
  });

  describe('readPidFile', () => {
    it('returns the PID from a valid file', async () => {
      vi.mocked(readFile).mockResolvedValueOnce('1234' as never);
      expect(await readPidFile('/some/path')).toBe(1234);
    });

    it('returns undefined when the file is missing', async () => {
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      vi.mocked(readFile).mockRejectedValueOnce(error);
      expect(await readPidFile('/missing/path')).toBeUndefined();
    });

    it('throws on non-ENOENT errors', async () => {
      const error = Object.assign(new Error('EACCES'), { code: 'EACCES' });
      vi.mocked(readFile).mockRejectedValueOnce(error);
      await expect(readPidFile('/some/path')).rejects.toThrow('EACCES');
    });

    it.each([['0'], ['-1'], ['not-a-number']])(
      'returns undefined for invalid content %s',
      async (content) => {
        vi.mocked(readFile).mockResolvedValueOnce(content as never);
        expect(await readPidFile('/some/path')).toBeUndefined();
      },
    );
  });

  describe('isProcessAlive', () => {
    it('returns true when the process exists', () => {
      vi.spyOn(process, 'kill').mockReturnValueOnce(true as never);
      expect(isProcessAlive(1234)).toBe(true);
    });

    it('returns true when the process exists but is owned by another user (EPERM)', () => {
      vi.spyOn(process, 'kill').mockImplementationOnce(() => {
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      });
      expect(isProcessAlive(1234)).toBe(true);
    });

    it('returns false when the process does not exist', () => {
      vi.spyOn(process, 'kill').mockImplementationOnce(() => {
        throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      });
      expect(isProcessAlive(1234)).toBe(false);
    });
  });

  describe('sendSignal', () => {
    it('returns true when the signal is delivered', () => {
      vi.spyOn(process, 'kill').mockReturnValueOnce(true as never);
      expect(sendSignal(1234, 'SIGTERM')).toBe(true);
    });

    it('returns false when the process does not exist (ESRCH)', () => {
      vi.spyOn(process, 'kill').mockImplementationOnce(() => {
        throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      });
      expect(sendSignal(1234, 'SIGTERM')).toBe(false);
    });

    it('throws on permission errors (EPERM)', () => {
      vi.spyOn(process, 'kill').mockImplementationOnce(() => {
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      });
      expect(() => sendSignal(1234, 'SIGTERM')).toThrow('EPERM');
    });
  });

  describe('parseTimeoutMs', () => {
    it('returns undefined when value is undefined', () => {
      expect(parseTimeoutMs(undefined)).toBeUndefined();
    });

    it.each([1, 5, 30, 100])(
      'converts %i seconds to milliseconds',
      (seconds) => {
        expect(parseTimeoutMs(seconds)).toBe(seconds * 1000);
      },
    );

    it.each([0, -1, -100, 1.5, 0.1, NaN, Infinity, -Infinity])(
      'throws for invalid value %s',
      (value) => {
        expect(() => parseTimeoutMs(value)).toThrow(
          '--timeout must be a positive integer',
        );
      },
    );
  });

  describe('waitFor', () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: 0 });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns true when condition is met immediately', async () => {
      const check = vi.fn().mockReturnValue(true);
      expect(await waitFor(check, 1000)).toBe(true);
    });

    it('returns true when condition is met before timeout', async () => {
      const check = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
      const promise = waitFor(check, 1000);
      await vi.advanceTimersByTimeAsync(250);
      expect(await promise).toBe(true);
    });

    it('returns false when condition is never met', async () => {
      const check = vi.fn().mockReturnValue(false);
      const promise = waitFor(check, 500);
      await vi.advanceTimersByTimeAsync(600);
      expect(await promise).toBe(false);
    });
  });
});
