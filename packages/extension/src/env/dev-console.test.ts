import { describe, it, expect } from 'vitest';
import './dev-console.js';

describe('vat-console', () => {
  describe('kernel', () => {
    it('is available on globalThis', async () => {
      expect(kernel).toBeDefined();
    });

    it('has expected property descriptors', async () => {
      expect(
        Object.getOwnPropertyDescriptor(globalThis, 'kernel'),
      ).toMatchObject({
        configurable: false,
        enumerable: true,
        writable: false,
      });
    });
  });
});
