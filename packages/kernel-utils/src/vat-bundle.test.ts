import { describe, it, expect } from 'vitest';

import { isVatBundle } from './vat-bundle.ts';

describe('isVatBundle', () => {
  describe('valid bundles', () => {
    it('accepts complete VatBundle with all properties', () => {
      const bundle = {
        moduleFormat: 'iife',
        code: 'var __vatExports__ = {};',
        exports: ['foo', 'bar'],
        external: [],
      };
      expect(isVatBundle(bundle)).toBe(true);
    });

    it('accepts VatBundle with empty exports and external', () => {
      const bundle = {
        moduleFormat: 'iife',
        code: 'var __vatExports__ = {};',
        exports: [],
        external: [],
      };
      expect(isVatBundle(bundle)).toBe(true);
    });
  });

  describe('invalid bundles - missing required properties', () => {
    it('rejects object missing moduleFormat', () => {
      const bundle = {
        code: 'var __vatExports__ = {};',
        exports: [],
        external: [],
      };
      expect(isVatBundle(bundle)).toBe(false);
    });

    it('rejects object missing code', () => {
      const bundle = {
        moduleFormat: 'iife',
        exports: [],
        external: [],
      };
      expect(isVatBundle(bundle)).toBe(false);
    });

    it('rejects object missing exports', () => {
      const bundle = {
        moduleFormat: 'iife',
        code: 'var __vatExports__ = {};',
        external: [],
      };
      expect(isVatBundle(bundle)).toBe(false);
    });

    it('rejects object missing external', () => {
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
        external: [],
      };
      expect(isVatBundle(bundle)).toBe(false);
    });

    it('rejects non-string code property', () => {
      const bundle = {
        moduleFormat: 'iife',
        code: 123,
        exports: [],
        external: [],
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
