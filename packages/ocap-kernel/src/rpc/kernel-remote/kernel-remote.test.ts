import { is } from '@metamask/superstruct';
import { describe, it, expect } from 'vitest';

import { remoteDeliverSpec } from './kernel-remote.ts';

describe('kernel-remote', () => {
  describe('remoteDeliverSpec', () => {
    it('should have correct method name', () => {
      expect(remoteDeliverSpec.method).toBe('remoteDeliver');
    });

    it.each([
      ['test-result', true],
      [123, false],
      [null, false],
      [undefined, false],
      ['', true],
      ['🌟', true],
    ])('should validate result type: %s -> %s', (value, expected) => {
      expect(is(value, remoteDeliverSpec.result)).toBe(expected);
    });

    describe('params validation', () => {
      it('should accept valid params', () => {
        const validParams = {
          from: 'peer-123',
          message: 'hello world',
        };

        expect(is(validParams, remoteDeliverSpec.params)).toBe(true);
      });

      it.each([
        [{ message: 'hello world' }, 'missing from field'],
        [{ from: 'peer-123' }, 'missing message field'],
        [{ from: 123, message: 'hello world' }, 'non-string from field'],
        [{ from: 'peer-123', message: 123 }, 'non-string message field'],
      ])('should reject params with %s', (invalidParams, _description) => {
        expect(is(invalidParams, remoteDeliverSpec.params)).toBe(false);
      });

      it('should reject params with extra fields', () => {
        const invalidParams = {
          from: 'peer-123',
          message: 'hello world',
          extra: 'field',
        };

        expect(is(invalidParams, remoteDeliverSpec.params)).toBe(false);
      });

      it.each([
        [null, 'null'],
        [undefined, 'undefined'],
        ['string', 'string'],
        [123, 'number'],
        [[], 'array'],
      ])('should reject %s params', (invalidParams, _type) => {
        expect(is(invalidParams, remoteDeliverSpec.params)).toBe(false);
      });
    });

    describe('edge cases', () => {
      it.each([
        ['', '', 'empty strings'],
        ['🌟peer-123🌟', 'hello 世界 🌍', 'unicode strings'],
        ['a'.repeat(10000), 'b'.repeat(10000), 'very long strings'],
      ])('should accept %s', (from, message, _description) => {
        const validParams = {
          from,
          message,
        };

        expect(is(validParams, remoteDeliverSpec.params)).toBe(true);
      });
    });
  });
});
