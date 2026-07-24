import { passStyleOf } from '@endo/marshal';
import {
  isKernelError,
  getKernelErrorCode,
  isFatalKernelError,
} from '@metamask/kernel-errors';
import { describe, it, expect } from 'vitest';

import {
  expandKrefMarkers,
  kslot,
  krefOf,
  kser,
  kunser,
  makeKernelError,
  makeFatalKernelError,
  KREF_MARKER,
} from './kernel-marshal.ts';
import type { SlotValue } from './kernel-marshal.ts';

describe('kernel-marshal', () => {
  describe('kslot', () => {
    it('creates promise standin for promise refs', () => {
      const standin = kslot('kp1');
      expect(passStyleOf(standin)).toBe('promise');
      expect(krefOf(standin)).toBe('kp1');
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

  describe('makeKernelError', () => {
    it('serializes an expected kernel error with the correct format', () => {
      const serialized = makeKernelError('OBJECT_DELETED', 'Target deleted');
      const deserialized = kunser(serialized);

      expect(deserialized).toBeInstanceOf(Error);
      expect((deserialized as Error).message).toBe(
        '[KERNEL:OBJECT_DELETED] Target deleted',
      );
    });

    it('round-trips through kernel-errors detection utilities', () => {
      const serialized = makeKernelError(
        'CONNECTION_LOST',
        'Remote connection lost',
      );
      const deserialized = kunser(serialized) as Error;

      expect(isKernelError(deserialized)).toBe(true);
      expect(getKernelErrorCode(deserialized)).toBe('CONNECTION_LOST');
      expect(isFatalKernelError(deserialized)).toBe(false);
    });
  });

  describe('makeFatalKernelError', () => {
    it('serializes a fatal kernel error with the VAT_FATAL infix', () => {
      const serialized = makeFatalKernelError('ILLEGAL_SYSCALL', 'Bad syscall');
      const deserialized = kunser(serialized);

      expect(deserialized).toBeInstanceOf(Error);
      expect((deserialized as Error).message).toBe(
        '[KERNEL:VAT_FATAL:ILLEGAL_SYSCALL] Bad syscall',
      );
    });

    it('round-trips through kernel-errors detection utilities', () => {
      const serialized = makeFatalKernelError(
        'INTERNAL_ERROR',
        'Something broke',
      );
      const deserialized = kunser(serialized) as Error;

      expect(isKernelError(deserialized)).toBe(true);
      expect(getKernelErrorCode(deserialized)).toBe('INTERNAL_ERROR');
      expect(isFatalKernelError(deserialized)).toBe(true);
    });
  });

  describe('expandKrefMarkers', () => {
    it('replaces a kref-marker object with a kslot standin', () => {
      const marker = { [KREF_MARKER]: 'ko7' };
      const expanded = expandKrefMarkers(marker);
      expect(passStyleOf(expanded as object)).toBe('remotable');
      expect(krefOf(expanded as SlotValue)).toBe('ko7');
    });

    it('walks arrays recursively', () => {
      const args = ['literal', { [KREF_MARKER]: 'ko8' }, 42];
      const [first, second, third] = expandKrefMarkers(args) as unknown[];
      expect(first).toBe('literal');
      expect(krefOf(second as SlotValue)).toBe('ko8');
      expect(third).toBe(42);
    });

    it('walks nested objects and preserves structure', () => {
      const args = [
        {
          manifest: 'parts shipment',
          receiver: { [KREF_MARKER]: 'ko9' },
        },
      ];
      const [only] = expandKrefMarkers(args) as unknown[];
      const record = only as { manifest: string; receiver: SlotValue };
      expect(record.manifest).toBe('parts shipment');
      expect(krefOf(record.receiver)).toBe('ko9');
    });

    it('leaves objects with extra own keys alone', () => {
      const notAMarker = { [KREF_MARKER]: 'ko10', decoy: true };
      const walked = expandKrefMarkers(notAMarker) as Record<string, unknown>;
      expect(walked[KREF_MARKER]).toBe('ko10');
      expect(walked.decoy).toBe(true);
    });

    it('throws on a marker with a malformed kref value', () => {
      expect(() => expandKrefMarkers({ [KREF_MARKER]: 'not-a-kref' })).toThrow(
        /kref/iu,
      );
    });

    it('produces standins that kser encodes as slots', () => {
      const args = expandKrefMarkers([
        'plain',
        { [KREF_MARKER]: 'ko11' },
      ]) as unknown[];
      const capData = kser(args);
      expect(capData.slots).toContain('ko11');
    });
  });
});
