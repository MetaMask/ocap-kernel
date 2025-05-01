import { describe, it, expect } from 'vitest';

import { parseRef } from './parse-ref.ts';

describe('parse-ref', () => {
  describe('parseRef', () => {
    describe('valid references', () => {
      it.each([
        // Kernel references
        [
          'ko123',
          {
            context: 'kernel',
            isPromise: false,
            index: '123',
            direction: undefined,
          },
        ],
        [
          'kp456',
          {
            context: 'kernel',
            isPromise: true,
            index: '456',
            direction: undefined,
          },
        ],

        // Vat references
        [
          'o+789',
          {
            context: 'vat',
            direction: 'export',
            isPromise: false,
            index: '789',
          },
        ],
        [
          'o-321',
          {
            context: 'vat',
            direction: 'import',
            isPromise: false,
            index: '321',
          },
        ],
        [
          'p+654',
          {
            context: 'vat',
            direction: 'export',
            isPromise: true,
            index: '654',
          },
        ],
        [
          'p-987',
          {
            context: 'vat',
            direction: 'import',
            isPromise: true,
            index: '987',
          },
        ],

        // Remote references
        [
          'ro+111',
          {
            context: 'remote',
            direction: 'export',
            isPromise: false,
            index: '111',
          },
        ],
        [
          'ro-222',
          {
            context: 'remote',
            direction: 'import',
            isPromise: false,
            index: '222',
          },
        ],
        [
          'rp+333',
          {
            context: 'remote',
            direction: 'export',
            isPromise: true,
            index: '333',
          },
        ],
        [
          'rp-444',
          {
            context: 'remote',
            direction: 'import',
            isPromise: true,
            index: '444',
          },
        ],

        // Edge cases
        [
          'o+',
          { context: 'vat', direction: 'export', isPromise: false, index: '' },
        ],
        [
          'kpabc',
          {
            context: 'kernel',
            isPromise: true,
            index: 'abc',
            direction: undefined,
          },
        ],
        [
          'o+',
          { context: 'vat', direction: 'export', isPromise: false, index: '' },
        ],
      ])('parses %s correctly', (ref, expected) => {
        expect(parseRef(ref)).toStrictEqual(expected);
      });
    });

    describe('error cases', () => {
      it.each([
        ['xo+123', 'invalid reference context "x"'],
        ['zo-456', 'invalid reference context "z"'],
        ['kx123', 'invalid reference type "x"'],
        ['rx+123', 'invalid reference type "x"'],
        ['o*123', 'invalid reference direction "*"'],
        ['p=456', 'invalid reference direction "="'],
        ['ro?789', 'invalid reference direction "?"'],
        ['rp!321', 'invalid reference direction "!"'],
        ['', 'invalid reference context "[undefined]"'],
      ])('throws for invalid reference %s', (ref, errorMessage) => {
        expect(() => parseRef(ref)).toThrow(errorMessage);
      });
    });
  });

  describe('reference patterns', () => {
    describe('context identification', () => {
      it.each([
        ['ko1', 'kernel'],
        ['kp2', 'kernel'],
        ['o+3', 'vat'],
        ['o-4', 'vat'],
        ['p+5', 'vat'],
        ['p-6', 'vat'],
        ['ro+7', 'remote'],
        ['ro-8', 'remote'],
        ['rp+9', 'remote'],
        ['rp-10', 'remote'],
      ])('identifies %s as %s context', (ref, expectedContext) => {
        expect(parseRef(ref).context).toBe(expectedContext);
      });
    });

    describe('promise vs object identification', () => {
      it.each([
        // Object references
        ['ko1', false],
        ['o+3', false],
        ['o-4', false],
        ['ro+7', false],
        ['ro-8', false],

        // Promise references
        ['kp2', true],
        ['p+5', true],
        ['p-6', true],
        ['rp+9', true],
        ['rp-10', true],
      ])('identifies %s as %s for isPromise', (ref, isPromise) => {
        expect(parseRef(ref).isPromise).toBe(isPromise);
      });
    });

    describe('direction identification', () => {
      it.each([
        // Export references
        ['o+3', 'export'],
        ['p+5', 'export'],
        ['ro+7', 'export'],
        ['rp+9', 'export'],

        // Import references
        ['o-4', 'import'],
        ['p-6', 'import'],
        ['ro-8', 'import'],
        ['rp-10', 'import'],
      ])('identifies %s as %s direction', (ref, expectedDirection) => {
        expect(parseRef(ref).direction).toBe(expectedDirection);
      });

      it.each(['ko1', 'kp2'])('kernel reference %s has no direction', (ref) => {
        expect(parseRef(ref).direction).toBeUndefined();
      });
    });
  });
});
