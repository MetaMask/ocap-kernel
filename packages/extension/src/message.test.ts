import { describe, it, expect } from 'vitest';

import { isWrappedIframeMessage } from './message.js';

describe('message', () => {
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
});
