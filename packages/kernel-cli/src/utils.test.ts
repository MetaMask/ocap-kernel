import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isProcessAlive, readPidFile, waitFor, withTimeout } from './utils.ts';

vi.mock('node:fs/promises');

describe('utils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
      vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'));
      expect(await readPidFile('/missing/path')).toBeUndefined();
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

    it('returns false when the process does not exist', () => {
      vi.spyOn(process, 'kill').mockImplementationOnce(() => {
        throw new Error('ESRCH');
      });
      expect(isProcessAlive(1234)).toBe(false);
    });
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
