import './endoify.js';
import { delay } from '@ocap/test-utils';
import { vi, describe, it, expect } from 'vitest';

import { makeHandledCallback } from './shared.js';

describe('shared', () => {
  describe('makeHandledCallback', () => {
    it('returns a function', () => {
      const callback = makeHandledCallback(async () => Promise.resolve());
      expect(callback).toBeInstanceOf(Function);
    });

    it('calls the original callback', () => {
      const originalCallback = vi.fn().mockResolvedValueOnce(undefined);
      const callback = makeHandledCallback(originalCallback);

      // eslint-disable-next-line n/callback-return
      callback();

      expect(originalCallback).toHaveBeenCalledOnce();
    });

    it('throws an error if the original callback throws an error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const error = new Error('test error');
      const originalCallback = vi.fn().mockRejectedValueOnce(error);
      const callback = makeHandledCallback(originalCallback);

      // eslint-disable-next-line n/callback-return
      callback();
      await delay();

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: error.message }),
      );
    });
  });
});
