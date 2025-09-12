import { is } from '@metamask/superstruct';
import { describe, it, expect } from 'vitest';

import { VatCheckpointStruct, VatDeliveryResultStruct } from './shared.ts';

describe('shared', () => {
  describe('VatCheckpointStruct', () => {
    it('should validate a valid VatCheckpoint with key-value pairs and deletions', () => {
      const validCheckpoint = [
        [
          ['key1', 'value1'],
          ['key2', 'value2'],
        ],
        ['deletedKey1', 'deletedKey2'],
      ];

      expect(is(validCheckpoint, VatCheckpointStruct)).toBe(true);
    });

    it('should validate an empty VatCheckpoint', () => {
      const emptyCheckpoint = [[], []];

      expect(is(emptyCheckpoint, VatCheckpointStruct)).toBe(true);
    });

    it('should validate VatCheckpoint with only key-value pairs', () => {
      const checkpointWithOnlyKV = [
        [
          ['onlyKey', 'onlyValue'],
          ['anotherKey', 'anotherValue'],
        ],
        [],
      ];

      expect(is(checkpointWithOnlyKV, VatCheckpointStruct)).toBe(true);
    });

    it('should validate VatCheckpoint with only deletions', () => {
      const checkpointWithOnlyDeletions = [
        [],
        ['deletedKey1', 'deletedKey2', 'deletedKey3'],
      ];

      expect(is(checkpointWithOnlyDeletions, VatCheckpointStruct)).toBe(true);
    });

    it('should validate VatCheckpoint with complex key-value pairs', () => {
      const complexCheckpoint = [
        [
          ['vat.state.counter', '42'],
          ['vat.exports.o+1', 'exported-object-1'],
          ['vat.imports.o-5', 'imported-object-5'],
          ['vat.promises.p+3', 'promise-3'],
        ],
        ['vat.old.key', 'vat.removed.export'],
      ];

      expect(is(complexCheckpoint, VatCheckpointStruct)).toBe(true);
    });

    it('should validate VatCheckpoint with unicode strings', () => {
      const unicodeCheckpoint = [
        [
          ['🔑key', '🌟value'],
          ['键', '值'],
          ['clé', 'valeur'],
        ],
        ['🗑️deleted', '已删除'],
      ];

      expect(is(unicodeCheckpoint, VatCheckpointStruct)).toBe(true);
    });

    it('should validate VatCheckpoint with empty strings', () => {
      const emptyStringCheckpoint = [
        [
          ['', ''],
          ['emptyValue', ''],
          ['', 'emptyKey'],
        ],
        ['', 'normalKey'],
      ];

      expect(is(emptyStringCheckpoint, VatCheckpointStruct)).toBe(true);
    });

    it('should validate VatCheckpoint with very long strings', () => {
      const longKey = 'k'.repeat(10000);
      const longValue = 'v'.repeat(10000);
      const longDeletedKey = 'd'.repeat(10000);

      const longStringCheckpoint = [[[longKey, longValue]], [longDeletedKey]];

      expect(is(longStringCheckpoint, VatCheckpointStruct)).toBe(true);
    });

    describe('invalid VatCheckpoint structures', () => {
      it.each([
        [{}, 'empty object'],
        [[], 'empty array'],
        [[{}], 'array with object'],
        [[[]], 'array with empty array'],
        [null, 'null'],
        [undefined, 'undefined'],
      ])('should reject %s', (invalidValue, _description) => {
        expect(is(invalidValue, VatCheckpointStruct)).toBe(false);
      });

      it.each([
        [[[]], 'single array'],
        [[[], [], []], 'three arrays'],
        [['invalid'], 'non-array element'],
      ])(
        'should reject incorrect tuple length: %s',
        (invalidValue, _description) => {
          expect(is(invalidValue, VatCheckpointStruct)).toBe(false);
        },
      );

      it.each([
        [['not-array', []], 'non-array first element'],
        [[{}, []], 'object first element'],
        [[null, []], 'null first element'],
        [[[], 'not-array'], 'non-array second element'],
        [[[], {}], 'object second element'],
        [[[], null], 'null second element'],
      ])('should reject %s', (invalidValue, _description) => {
        expect(is(invalidValue, VatCheckpointStruct)).toBe(false);
      });

      it.each([
        [[['invalid-pair'], []], 'single element in key-value pair'],
        [[[['key']], []], 'incomplete key-value pair'],
        [[[['key', 'value', 'extra']], []], 'extra element in key-value pair'],
        [[[[123, 'value']], []], 'non-string key'],
        [[[['key', 456]], []], 'non-string value'],
      ])(
        'should reject invalid key-value pair: %s',
        (invalidValue, _description) => {
          expect(is(invalidValue, VatCheckpointStruct)).toBe(false);
        },
      );

      it.each([
        [[[], [123]], 'number in deletion array'],
        [[[], [null]], 'null in deletion array'],
        [[[], [{}]], 'object in deletion array'],
        [[[], [['nested']]], 'nested array in deletion array'],
      ])('should reject %s', (invalidValue, _description) => {
        expect(is(invalidValue, VatCheckpointStruct)).toBe(false);
      });
    });
  });

  describe('VatDeliveryResultStruct', () => {
    it('should validate VatDeliveryResult with string error', () => {
      const validResult = [
        [[['key', 'value']], ['deletedKey']],
        'Error message',
      ];

      expect(is(validResult, VatDeliveryResultStruct)).toBe(true);
    });

    it('should validate VatDeliveryResult with null error', () => {
      const validResult = [[[['key', 'value']], ['deletedKey']], null];

      expect(is(validResult, VatDeliveryResultStruct)).toBe(true);
    });

    it('should validate VatDeliveryResult with empty checkpoint and string error', () => {
      const validResult = [[[], []], 'Some error occurred'];

      expect(is(validResult, VatDeliveryResultStruct)).toBe(true);
    });

    it('should validate VatDeliveryResult with empty checkpoint and null error', () => {
      const validResult = [[[], []], null];

      expect(is(validResult, VatDeliveryResultStruct)).toBe(true);
    });

    it('should validate VatDeliveryResult with complex checkpoint and error', () => {
      const complexResult = [
        [
          [
            ['vat.state.counter', '42'],
            ['vat.exports.o+1', 'exported-object-1'],
            ['vat.imports.o-5', 'imported-object-5'],
          ],
          ['vat.old.key', 'vat.removed.export'],
        ],
        'TypeError: Cannot read property of undefined',
      ];

      expect(is(complexResult, VatDeliveryResultStruct)).toBe(true);
    });

    it('should validate VatDeliveryResult with unicode error message', () => {
      const unicodeResult = [
        [[['🔑key', '🌟value']], ['🗑️deleted']],
        '错误: 无法处理请求 🚫',
      ];

      expect(is(unicodeResult, VatDeliveryResultStruct)).toBe(true);
    });

    it('should validate VatDeliveryResult with empty string error', () => {
      const emptyErrorResult = [[[['key', 'value']], []], ''];

      expect(is(emptyErrorResult, VatDeliveryResultStruct)).toBe(true);
    });

    it('should validate VatDeliveryResult with very long error message', () => {
      const longError = 'Error: '.repeat(1000);
      const longErrorResult = [[[], []], longError];

      expect(is(longErrorResult, VatDeliveryResultStruct)).toBe(true);
    });

    describe('invalid VatDeliveryResult structures', () => {
      it.each([
        [{}, 'empty object'],
        [[], 'empty array'],
        [[{}], 'array with object'],
        [null, 'null'],
        [undefined, 'undefined'],
      ])(
        'should reject non-tuple structures: %s',
        (invalidValue, _description) => {
          expect(is(invalidValue, VatDeliveryResultStruct)).toBe(false);
        },
      );

      it.each([
        [[[[], []]], 'single element tuple'],
        [[[[], []], null, 'extra'], 'three element tuple'],
      ])(
        'should reject incorrect tuple length: %s',
        (invalidValue, _description) => {
          expect(is(invalidValue, VatDeliveryResultStruct)).toBe(false);
        },
      );

      it.each([
        [['invalid-checkpoint', null], 'string checkpoint'],
        [[{}, null], 'object checkpoint'],
        [[null, null], 'null checkpoint'],
      ])(
        'should reject invalid checkpoint (first element): %s',
        (invalidValue, _description) => {
          expect(is(invalidValue, VatDeliveryResultStruct)).toBe(false);
        },
      );

      it.each([
        [[[[], []], 123], 'number error'],
        [[[[], []], true], 'boolean error'],
        [[[[], []], {}], 'object error'],
        [[[[], []], []], 'array error'],
        [[[[], []], undefined], 'undefined error'],
      ])(
        'should reject invalid error type (second element): %s',
        (invalidValue, _description) => {
          expect(is(invalidValue, VatDeliveryResultStruct)).toBe(false);
        },
      );

      it.each([
        [[[[['invalid-pair']], []], null], 'invalid key-value pairs'],
        [[[[], [123]], null], 'non-string deletion keys'],
        [[[[], [], []], null], 'wrong checkpoint tuple length'],
      ])(
        'should reject invalid checkpoint structure within VatDeliveryResult: %s',
        (invalidValue, _description) => {
          expect(is(invalidValue, VatDeliveryResultStruct)).toBe(false);
        },
      );
    });
  });

  describe('integration scenarios', () => {
    it.each([
      [
        [
          [
            ['vat.state.counter', '43'],
            ['vat.exports.o+2', 'new-exported-object'],
            ['vat.promises.p+1', 'resolved-promise'],
          ],
          ['vat.temp.data'],
        ],
        null,
        'vat execution success',
      ],
      [
        [[['vat.state.lastError', 'TypeError in user code']], []],
        'TypeError: Cannot read property "foo" of undefined at line 42',
        'vat execution failure',
      ],
      [
        [
          [
            ['vat.state.initialized', 'true'],
            ['vat.exports.root', 'o+0'],
          ],
          [],
        ],
        null,
        'vat startup',
      ],
      [
        [
          [],
          [
            'vat.exports.o+10',
            'vat.exports.o+11',
            'vat.imports.o-5',
            'vat.promises.p+3',
          ],
        ],
        null,
        'vat garbage collection',
      ],
    ])(
      'should validate realistic %s scenario',
      (checkpoint, error, _description) => {
        const deliveryResult = [checkpoint, error];
        expect(is(deliveryResult, VatDeliveryResultStruct)).toBe(true);
      },
    );

    it('should validate large state change scenario', () => {
      const largeStateChange = [
        [
          Array.from({ length: 100 }, (_, i) => [
            `vat.state.item${i}`,
            `value${i}`,
          ]),
          Array.from({ length: 50 }, (_, i) => `vat.old.item${i}`),
        ],
        null,
      ];

      expect(is(largeStateChange, VatDeliveryResultStruct)).toBe(true);
    });
  });
});
