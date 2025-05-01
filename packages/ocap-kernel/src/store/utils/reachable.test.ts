import { describe, it, expect } from 'vitest';

import {
  parseReachableAndVatSlot,
  buildReachableAndVatSlot,
} from './reachable.ts';

describe('reachable', () => {
  describe('parseReachableAndVatSlot', () => {
    it('parses reachable flag correctly', () => {
      expect(parseReachableAndVatSlot('R o+123')).toStrictEqual({
        isReachable: true,
        vatSlot: 'o+123',
      });

      expect(parseReachableAndVatSlot('_ o+123')).toStrictEqual({
        isReachable: false,
        vatSlot: 'o+123',
      });
    });

    it('works with different vat slot types', () => {
      // Object slots
      expect(parseReachableAndVatSlot('R o+123')).toStrictEqual({
        isReachable: true,
        vatSlot: 'o+123',
      });

      expect(parseReachableAndVatSlot('_ o-456')).toStrictEqual({
        isReachable: false,
        vatSlot: 'o-456',
      });

      // Promise slots
      expect(parseReachableAndVatSlot('R p+789')).toStrictEqual({
        isReachable: true,
        vatSlot: 'p+789',
      });

      expect(parseReachableAndVatSlot('_ p-012')).toStrictEqual({
        isReachable: false,
        vatSlot: 'p-012',
      });
    });

    it('throws for invalid flag format', () => {
      expect(() => parseReachableAndVatSlot('X o+123')).toThrow(
        `flag ("X") must be 'R' or '_'`,
      );
      expect(() => parseReachableAndVatSlot('Ro+123')).toThrow(
        'Expected "o" is same as " "',
      );
      expect(() => parseReachableAndVatSlot('R')).toThrow(
        'Expected "" is same as " "',
      );
    });

    it('throws for non-string input', () => {
      // @ts-expect-error Testing invalid input
      expect(() => parseReachableAndVatSlot(123)).toThrow(
        'non-string value: 123',
      );
      // @ts-expect-error Testing invalid input
      expect(() => parseReachableAndVatSlot(null)).toThrow(
        'non-string value: null',
      );
      // @ts-expect-error Testing invalid input
      expect(() => parseReachableAndVatSlot(undefined)).toThrow(
        'non-string value: "[undefined]"',
      );
    });
  });

  describe('buildReachableAndVatSlot', () => {
    it('builds string with reachable flag correctly', () => {
      expect(buildReachableAndVatSlot(true, 'o+123')).toBe('R o+123');
      expect(buildReachableAndVatSlot(false, 'o+123')).toBe('_ o+123');
    });

    it('works with different vat slot types', () => {
      // Object slots
      expect(buildReachableAndVatSlot(true, 'o+123')).toBe('R o+123');
      expect(buildReachableAndVatSlot(false, 'o-456')).toBe('_ o-456');

      // Promise slots
      expect(buildReachableAndVatSlot(true, 'p+789')).toBe('R p+789');
      expect(buildReachableAndVatSlot(false, 'p-012')).toBe('_ p-012');
    });
  });

  describe('round-trip conversion', () => {
    it('can round-trip reachable values', () => {
      const testCases = [
        { isReachable: true, vatSlot: 'o+123' },
        { isReachable: false, vatSlot: 'o-456' },
        { isReachable: true, vatSlot: 'p+789' },
        { isReachable: false, vatSlot: 'p-012' },
      ];

      for (const testCase of testCases) {
        const { isReachable, vatSlot } = testCase;
        const built = buildReachableAndVatSlot(isReachable, vatSlot);
        const parsed = parseReachableAndVatSlot(built);

        expect(parsed).toStrictEqual(testCase);
      }
    });
  });
});
