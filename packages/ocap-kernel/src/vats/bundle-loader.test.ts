import { describe, it, expect } from 'vitest';

import { loadBundle } from './bundle-loader.ts';

describe('loadBundle', () => {
  describe('input validation', () => {
    it('throws on unknown bundle format', () => {
      const content = JSON.stringify({ moduleFormat: 'unknown' });
      expect(() => loadBundle(content)).toThrow(
        'Unknown bundle format: unknown',
      );
    });

    it('throws on missing moduleFormat', () => {
      const content = JSON.stringify({});
      expect(() => loadBundle(content)).toThrow(
        'Unknown bundle format: undefined',
      );
    });

    // BUG: loadBundle does not validate code property before using it
    // See PR #763 bugbot claim #2
    it.fails('throws on missing code property', () => {
      const content = JSON.stringify({ moduleFormat: 'iife' });
      expect(() => loadBundle(content)).toThrow('Invalid bundle: missing code');
    });

    // BUG: loadBundle does not validate code property before using it
    // See PR #763 bugbot claim #2
    it.fails('throws on non-string code property', () => {
      const content = JSON.stringify({ moduleFormat: 'iife', code: 123 });
      expect(() => loadBundle(content)).toThrow(
        'Invalid bundle: code must be a string',
      );
    });
  });

  describe('bundle evaluation', () => {
    it('evaluates valid iife bundle and returns exports', () => {
      const content = JSON.stringify({
        moduleFormat: 'iife',
        code: 'var __vatExports__ = { foo: "bar" };',
      });
      const result = loadBundle(content);
      expect(result).toStrictEqual({ foo: 'bar' });
    });

    it('provides harden global to compartment', () => {
      const content = JSON.stringify({
        moduleFormat: 'iife',
        code: 'var __vatExports__ = { hasHarden: typeof harden === "function" };',
      });
      const result = loadBundle(content);
      expect(result).toStrictEqual({ hasHarden: true });
    });

    it('passes endowments to compartment', () => {
      const content = JSON.stringify({
        moduleFormat: 'iife',
        code: 'var __vatExports__ = { customValue: customEndowment };',
      });
      const result = loadBundle(content, {
        endowments: { customEndowment: 42 },
      });
      expect(result).toStrictEqual({ customValue: 42 });
    });

    it('passes inescapableGlobalProperties to compartment', () => {
      const content = JSON.stringify({
        moduleFormat: 'iife',
        code: 'var __vatExports__ = { inescapableValue: globalProp };',
      });
      const result = loadBundle(content, {
        inescapableGlobalProperties: { globalProp: 'test' },
      });
      expect(result).toStrictEqual({ inescapableValue: 'test' });
    });
  });
});
