import { describe, it, expect } from 'vitest';
import './dev-console.js';

describe('dev-console', () => {
  describe('omnium', () => {
    it('is available on globalThis', async () => {
      expect(omnium).toBeDefined();
    });

    it('has expected property descriptors', async () => {
      expect(
        Object.getOwnPropertyDescriptor(globalThis, 'omnium'),
      ).toMatchObject({
        configurable: false,
        enumerable: true,
        writable: false,
      });
    });
  });
});
