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

    it.each([
      [{}],
      [{ id: '1' }],
      [{ message: { type: 'evaluate' } }],
      [{ id: '1', message: { type: 'evaluate' } }],
      [{ id: '1', message: { type: 'evaluate', data: 1 } }],
    ])('returns false for invalid messages: %j', (message) => {
      expect(isWrappedIframeMessage(message)).toBe(false);
    });
  });
});
