import { vi, describe, it, expect } from 'vitest';

import { isWrappedIframeMessage, makeHandledCallback } from './shared.js';

describe('shared', () => {
  describe('isWrappedIframeMessage', () => {
    it('returns true for valid messages', () => {
      expect(
        isWrappedIframeMessage({
          id: '1',
          message: { type: 'evaluate', data: '1 + 1' },
        }),
      ).toBe(true);
    });

    it('returns false for invalid messages', () => {
      const invalidMessages = [
        {},
        { id: '1' },
        { message: { type: 'evaluate' } },
        { id: '1', message: { type: 'evaluate' } },
        { id: '1', message: { type: 'evaluate', data: 1 } },
      ];

      invalidMessages.forEach((message) => {
        expect(isWrappedIframeMessage(message)).toBe(false);
      });
    });
  });

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
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await null;

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: error.message }),
      );
    });
  });
});
