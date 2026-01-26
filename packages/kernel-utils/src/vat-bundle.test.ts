import { describe, it, expect } from 'vitest';

import { isVatBundle } from './vat-bundle.ts';

describe('isVatBundle', () => {
  describe('valid bundles', () => {
    it('accepts complete VatBundle with all properties', () => {
      const bundle = {
        moduleFormat: 'iife',
        code: 'var __vatExports__ = {};',
        exports: ['foo', 'bar'],
        modules: {
          './module.js': { renderedExports: ['a'], removedExports: ['b'] },
        },
      };
      expect(isVatBundle(bundle)).toBe(true);
    });

    it('accepts VatBundle with empty exports and modules', () => {
      const bundle = {
        moduleFormat: 'iife',
        code: 'var __vatExports__ = {};',
        exports: [],
        modules: {},
      };
      expect(isVatBundle(bundle)).toBe(true);
    });
  });

  describe('invalid bundles - missing required properties', () => {
    it('rejects object missing moduleFormat', () => {
      const bundle = {
        code: 'var __vatExports__ = {};',
        exports: [],
        modules: {},
      };
      expect(isVatBundle(bundle)).toBe(false);
    });

    it('rejects object missing code', () => {
      const bundle = {
        moduleFormat: 'iife',
        exports: [],
        modules: {},
      };
      expect(isVatBundle(bundle)).toBe(false);
    });

    // BUG: isVatBundle does not check for exports property
    // See PR #763 bugbot claim #7
    it.fails('rejects object missing exports', () => {
      const bundle = {
        moduleFormat: 'iife',
        code: 'var __vatExports__ = {};',
        modules: {},
      };
      expect(isVatBundle(bundle)).toBe(false);
    });

    // BUG: isVatBundle does not check for modules property
    // See PR #763 bugbot claim #7
    it.fails('rejects object missing modules', () => {
      const bundle = {
        moduleFormat: 'iife',
        code: 'var __vatExports__ = {};',
        exports: [],
      };
      expect(isVatBundle(bundle)).toBe(false);
    });
  });

  describe('invalid bundles - wrong property types', () => {
    it('rejects wrong moduleFormat value', () => {
      const bundle = {
        moduleFormat: 'cjs',
        code: 'var __vatExports__ = {};',
        exports: [],
        modules: {},
      };
      expect(isVatBundle(bundle)).toBe(false);
    });

    it('rejects non-string code property', () => {
      const bundle = {
        moduleFormat: 'iife',
        code: 123,
        exports: [],
        modules: {},
      };
      expect(isVatBundle(bundle)).toBe(false);
    });
  });

  describe('invalid bundles - non-objects', () => {
    it.each`
      label          | value
      ${'null'}      | ${null}
      ${'undefined'} | ${undefined}
      ${'string'}    | ${'not a bundle'}
      ${'number'}    | ${42}
      ${'array'}     | ${[]}
    `('rejects $label', ({ value }) => {
      expect(isVatBundle(value)).toBe(false);
    });
  });
});
