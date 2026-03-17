import type { LogEntry } from '@metamask/logger';
import { describe, expect, it, vi } from 'vitest';

import { randomLetter } from './utils.ts';

describe('utils', () => {
  describe('randomLetter', () => {
    it('returns a letter', () => {
      const letters = 'abcdefghijklmnopqrstuvwxyz';
      expect(letters).toContain(randomLetter());
    });
  });

  describe('filterTransports', () => {
    it('filters out only the ignored tags', async () => {
      vi.resetModules();
      vi.doMock('./constants.ts', async (importOriginal) => ({
        ...(await importOriginal()),
        IGNORE_TAGS: ['foo'],
      }));
      const transport = vi.fn();
      const { filterTransports } = await import('./utils.ts');
      const filteredTransport = filterTransports(transport);

      const ignoredEntry = { level: 'debug', tags: ['foo'], message: 'test' };
      filteredTransport(ignoredEntry as LogEntry);
      expect(transport).not.toHaveBeenCalledWith(ignoredEntry);

      const passedEntry = { level: 'debug', tags: ['bar'], message: 'test' };
      filteredTransport(passedEntry as LogEntry);
      expect(transport).toHaveBeenCalledWith(passedEntry);
    });

    it('filters out all tags', async () => {
      vi.resetModules();
      vi.doMock('./constants.ts', async (importOriginal) => ({
        ...(await importOriginal()),
        IGNORE_TAGS: ['all'],
      }));
      const transport = vi.fn();
      const { filterTransports } = await import('./utils.ts');
      const filteredTransport = filterTransports(transport);
      const ignoredEntry = { level: 'debug', tags: [], message: 'test' };
      filteredTransport(ignoredEntry as LogEntry);
      expect(transport).not.toHaveBeenCalledWith(ignoredEntry);
    });
  });
});
