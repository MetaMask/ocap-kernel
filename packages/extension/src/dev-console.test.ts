import { describe, it, expect } from 'vitest';
import './dev-console.js';
import '@ocap/shims/endoify';

describe('vat-console', () => {
  describe('kernel', () => {
    it('is available on globalThis', async () => {
      expect(kernel).toBeDefined();
    });

    it('is writable', async () => {
      Object.defineProperty(globalThis.kernel, 'namingThings', {
        value: 'is hard',
      });
      expect(kernel).toHaveProperty('namingThings', 'is hard');
    });

    it('is not rewritable', async () => {
      Object.defineProperty(globalThis.kernel, 'namingThings', {
        value: 'is hard',
      });
      expect(() =>
        Object.defineProperty(globalThis.kernel, 'namingThings', {
          value: 'and final',
        }),
      ).toThrow(/Cannot redefine property:/u);
    });
  });
});
