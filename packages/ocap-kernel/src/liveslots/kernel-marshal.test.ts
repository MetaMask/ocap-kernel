import { passStyleOf } from '@endo/marshal';
import { describe, it, expect } from 'vitest';

import { kslot, krefOf, kser, kunser, makeError } from './kernel-marshal.ts';
import type { SlotValue } from './kernel-marshal.ts';

describe('kernel-marshal', () => {
  describe('kslot', () => {
    it('creates promise standin for promise refs', () => {
      const promiseRefs = ['p1', 'kp1', 'rp1'];

      for (const ref of promiseRefs) {
        const standin = kslot(ref);
        expect(passStyleOf(standin)).toBe('promise');
        expect(krefOf(standin)).toBe(ref);
      }
    });

    it('creates remotable standin for object refs', () => {
      const ref = 'ko1';
      const iface = 'TestInterface';
      const standin = kslot(ref, iface);

      expect(passStyleOf(standin)).toBe('remotable');
      expect(krefOf(standin)).toBe(ref);
      expect((standin as SlotValue & { iface(): string }).iface()).toBe(iface);
    });

    it('strips Alleged: prefix from interface', () => {
      const ref = 'ko1';
      const iface = 'Alleged: TestInterface';
      const standin = kslot(ref, iface);

      expect((standin as SlotValue & { iface(): string }).iface()).toBe(
        'TestInterface',
      );
    });
  });

  describe('krefOf', () => {
    it('extracts kref from promise standin', () => {
      const ref = 'kp1';
      const standin = kslot(ref);
      expect(krefOf(standin)).toBe(ref);
    });

    it('extracts kref from remotable standin', () => {
      const ref = 'ko1';
      const standin = kslot(ref);
      expect(krefOf(standin)).toBe(ref);
    });

    it('throws for invalid input', () => {
      expect(() => krefOf(harden({}) as SlotValue)).toThrow(
        'krefOf requires a promise or remotable',
      );
      expect(() => krefOf(null as unknown as SlotValue)).toThrow(
        'krefOf requires a promise or remotable',
      );
    });
  });

  describe('kser/kunser', () => {
    it('serializes and deserializes primitive values', () => {
      const values = [
        42,
        'hello',
        true,
        null,
        undefined,
        ['array', 123],
        { key: 'value' },
      ];

      for (const value of values) {
        const serialized = kser(value);
        const deserialized = kunser(serialized);
        expect(deserialized).toStrictEqual(value);
      }
    });

    it('serializes and deserializes objects with krefs', () => {
      const ko1 = kslot('ko1', 'TestInterface');
      const kp1 = kslot('kp1');

      const value = {
        obj: ko1,
        promise: kp1,
        data: 'test',
      };

      const serialized = kser(value);
      expect(serialized).toHaveProperty('body');
      expect(serialized).toHaveProperty('slots');

      const deserialized = kunser(serialized) as {
        obj: SlotValue;
        promise: SlotValue;
        data: string;
      };
      expect(deserialized).toHaveProperty('obj');
      expect(deserialized).toHaveProperty('promise');
      expect(deserialized).toHaveProperty('data', 'test');

      expect(krefOf(deserialized.obj)).toBe('ko1');
      expect(krefOf(deserialized.promise)).toBe('kp1');
    });

    it('preserves pass-style of serialized values', () => {
      const ko1 = kslot('ko1', 'TestInterface');
      const kp1 = kslot('kp1');

      const serialized = kser({ obj: ko1, promise: kp1 });
      const deserialized = kunser(serialized) as {
        obj: SlotValue;
        promise: SlotValue;
      };

      expect(passStyleOf(deserialized.obj)).toBe('remotable');
      expect(passStyleOf(deserialized.promise)).toBe('promise');
    });
  });

  describe('makeError', () => {
    it('creates serialized error with message', () => {
      const message = 'Test error message';
      const serialized = makeError(message);
      const deserialized = kunser(serialized);

      expect(deserialized).toBeInstanceOf(Error);
      expect((deserialized as Error).message).toBe(message);
    });

    it('throws for non-string message', () => {
      expect(() => makeError(123 as unknown as string)).toThrow(
        '123 must be a string',
      );
      expect(() => makeError(null as unknown as string)).toThrow(
        'null must be a string',
      );
      expect(() => makeError(undefined as unknown as string)).toThrow(
        '"[undefined]" must be a string',
      );
    });
  });
});
