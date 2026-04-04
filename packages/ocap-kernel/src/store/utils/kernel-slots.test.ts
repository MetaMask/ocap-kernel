import { describe, it, expect } from 'vitest';

import {
  parseKernelSlot,
  makeKernelSlot,
  insistKernelType,
} from './kernel-slots.ts';
import type { KRef } from '../../types.ts';

describe('kernel-slots', () => {
  describe('parseKernelSlot', () => {
    it('parses object slots correctly', () => {
      const result = parseKernelSlot('ko123' as KRef);
      expect(result).toStrictEqual({
        type: 'object',
        id: '123',
      });
    });

    it('parses promise slots correctly', () => {
      const result = parseKernelSlot('kp456' as KRef);
      expect(result).toStrictEqual({
        type: 'promise',
        id: '456',
      });
    });

    it('throws for invalid slot format', () => {
      expect(() => parseKernelSlot('invalid' as KRef)).toThrow(
        'invalid kernelSlot "invalid"',
      );
      expect(() => parseKernelSlot('k123' as KRef)).toThrow(
        'invalid kernelSlot "k123"',
      );
      expect(() => parseKernelSlot('kx123' as KRef)).toThrow(
        'invalid kernelSlot "kx123"',
      );
    });
  });

  describe('makeKernelSlot', () => {
    it('creates object slots correctly', () => {
      expect(makeKernelSlot('object', '123')).toBe('ko123');
    });

    it('creates promise slots correctly', () => {
      expect(makeKernelSlot('promise', '456')).toBe('kp456');
    });

    it('throws for invalid type', () => {
      // @ts-expect-error Testing invalid input
      expect(() => makeKernelSlot('invalid', '123')).toThrow(
        'unknown type "invalid"',
      );
    });
  });

  describe('insistKernelType', () => {
    it('passes for correct object type', () => {
      expect(() => insistKernelType('object', 'ko123' as KRef)).not.toThrow();
    });

    it('passes for correct promise type', () => {
      expect(() => insistKernelType('promise', 'kp456' as KRef)).not.toThrow();
    });

    it('throws for mismatched type', () => {
      expect(() => insistKernelType('object', 'kp123' as KRef)).toThrow(
        'kernelSlot "kp123" is not of type "object"',
      );
      expect(() => insistKernelType('promise', 'ko456' as KRef)).toThrow(
        'kernelSlot "ko456" is not of type "promise"',
      );
    });

    it('throws for invalid slot format', () => {
      expect(() => insistKernelType('object', 'invalid' as KRef)).toThrow(
        'invalid kernelSlot "invalid"',
      );
      expect(() => insistKernelType('promise', 'k123' as KRef)).toThrow(
        'invalid kernelSlot "k123"',
      );
    });

    it('throws for undefined input', () => {
      expect(() => insistKernelType('object', undefined)).toThrow(
        'kernelSlot is undefined',
      );
    });
  });

  describe('integration', () => {
    it('can round-trip object slots', () => {
      const slot = makeKernelSlot('object', '123');
      const parsed = parseKernelSlot(slot);
      expect(parsed.type).toBe('object');
      expect(parsed.id).toBe('123');
      expect(makeKernelSlot(parsed.type, parsed.id)).toBe(slot);
    });

    it('can round-trip promise slots', () => {
      const slot = makeKernelSlot('promise', '456');
      const parsed = parseKernelSlot(slot);
      expect(parsed.type).toBe('promise');
      expect(parsed.id).toBe('456');
      expect(makeKernelSlot(parsed.type, parsed.id)).toBe(slot);
    });

    it('insistKernelType works with makeKernelSlot', () => {
      const objectSlot = makeKernelSlot('object', '123');
      const promiseSlot = makeKernelSlot('promise', '456');

      expect(() => insistKernelType('object', objectSlot)).not.toThrow();
      expect(() => insistKernelType('promise', promiseSlot)).not.toThrow();
      expect(() => insistKernelType('object', promiseSlot)).toThrow(
        'kernelSlot "kp456" is not of type "object"',
      );
      expect(() => insistKernelType('promise', objectSlot)).toThrow(
        'kernelSlot "ko123" is not of type "promise"',
      );
    });
  });
});
