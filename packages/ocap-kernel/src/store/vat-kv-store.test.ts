import { describe, it, expect } from 'vitest';

import { makeVatKVStore } from './vat-kv-store.ts';

describe('VatKVStore', () => {
  describe('basic functionality', () => {
    it('should work with basic operations', () => {
      const backingStore = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3'],
      ]);
      const vatstore = makeVatKVStore(backingStore);

      expect(vatstore.get('key1')).toBe('value1');
      expect(vatstore.get('key4')).toBeUndefined();

      vatstore.set('key2', 'revisedValue2');
      expect(vatstore.get('key2')).toBe('revisedValue2');

      vatstore.set('key4', 'value4');
      expect(vatstore.get('key4')).toBe('value4');

      vatstore.delete('key1');
      expect(vatstore.get('key1')).toBeUndefined();

      const checkpoint = vatstore.checkpoint();
      expect(checkpoint).toStrictEqual([
        [
          ['key2', 'revisedValue2'],
          ['key4', 'value4'],
        ],
        ['key1'],
      ]);

      const checkpoint2 = vatstore.checkpoint();
      expect(checkpoint2).toStrictEqual([[], []]);

      expect(backingStore).toStrictEqual(
        new Map([
          ['key2', 'revisedValue2'],
          ['key3', 'value3'],
          ['key4', 'value4'],
        ]),
      );
    });

    it('should work with empty backing store', () => {
      const backingStore = new Map<string, string>();
      const vatstore = makeVatKVStore(backingStore);

      expect(vatstore.get('nonexistent')).toBeUndefined();

      vatstore.set('first', 'value');
      expect(vatstore.get('first')).toBe('value');

      const checkpoint = vatstore.checkpoint();
      expect(checkpoint).toStrictEqual([[['first', 'value']], []]);

      expect(backingStore).toStrictEqual(new Map([['first', 'value']]));
    });
  });

  describe('get method', () => {
    it.each([
      ['existing', 'value', 'value'],
      ['empty', '', ''],
      ['unicode', '🌟', '🌟'],
    ])('should return %s for key %s', (key, setValue, expected) => {
      const backingStore = new Map([[key, setValue]]);
      const vatstore = makeVatKVStore(backingStore);

      expect(vatstore.get(key)).toBe(expected);
    });

    it.each(['nonexistent', '', 'key2', 'missing'])(
      'should return undefined for non-existing key %s',
      (key) => {
        const backingStore = new Map([['key1', 'value1']]);
        const vatstore = makeVatKVStore(backingStore);

        expect(vatstore.get(key)).toBeUndefined();
      },
    );

    it('should return updated values after set', () => {
      const backingStore = new Map([['key', 'original']]);
      const vatstore = makeVatKVStore(backingStore);

      expect(vatstore.get('key')).toBe('original');

      vatstore.set('key', 'updated');
      expect(vatstore.get('key')).toBe('updated');
    });
  });

  describe('getRequired method', () => {
    it('should return existing values', () => {
      const backingStore = new Map([
        ['key1', 'value1'],
        ['nonempty', 'value'],
      ]);
      const vatstore = makeVatKVStore(backingStore);

      expect(vatstore.getRequired('key1')).toBe('value1');
      expect(vatstore.getRequired('nonempty')).toBe('value');
    });

    it.each([
      [
        'nonexistent',
        new Map([['key1', 'value1']]),
        "no value matching key 'nonexistent'",
      ],
      ['', new Map([['key1', 'value1']]), "no value matching key ''"],
      ['missing', new Map(), "no value matching key 'missing'"],
      ['empty', new Map([['empty', '']]), "no value matching key 'empty'"], // Empty strings are falsy
    ])('should throw error for key %s', (key, backingStore, expectedError) => {
      const vatstore = makeVatKVStore(backingStore);

      expect(() => vatstore.getRequired(key)).toThrow(expectedError);
    });

    it('should return updated values after set', () => {
      const backingStore = new Map<string, string>();
      const vatstore = makeVatKVStore(backingStore);

      vatstore.set('newkey', 'newvalue');
      expect(vatstore.getRequired('newkey')).toBe('newvalue');
    });
  });

  describe('set method', () => {
    it('should set new keys', () => {
      const backingStore = new Map<string, string>();
      const vatstore = makeVatKVStore(backingStore);

      vatstore.set('newkey', 'newvalue');
      expect(vatstore.get('newkey')).toBe('newvalue');
      expect(backingStore.get('newkey')).toBe('newvalue');
    });

    it('should update existing keys', () => {
      const backingStore = new Map([['key', 'original']]);
      const vatstore = makeVatKVStore(backingStore);

      vatstore.set('key', 'updated');
      expect(vatstore.get('key')).toBe('updated');
      expect(backingStore.get('key')).toBe('updated');
    });

    it.each([
      ['', 'empty-key-value'],
      ['empty-value', ''],
      ['🔑', '🌟'],
      ['键', '值'],
    ])('should handle special strings: key=%s, value=%s', (key, value) => {
      const backingStore = new Map<string, string>();
      const vatstore = makeVatKVStore(backingStore);

      vatstore.set(key, value);

      expect(vatstore.get(key)).toBe(value);
      expect(backingStore.get(key)).toBe(value);
    });

    it('should handle very long strings', () => {
      const backingStore = new Map<string, string>();
      const vatstore = makeVatKVStore(backingStore);

      const longKey = 'k'.repeat(10000);
      const longValue = 'v'.repeat(10000);

      vatstore.set(longKey, longValue);
      expect(vatstore.get(longKey)).toBe(longValue);
    });

    it('should remove key from deletes if previously deleted', () => {
      const backingStore = new Map([['key', 'value']]);
      const vatstore = makeVatKVStore(backingStore);

      vatstore.delete('key');
      vatstore.set('key', 'newvalue');

      const checkpoint = vatstore.checkpoint();
      expect(checkpoint).toStrictEqual([[['key', 'newvalue']], []]);
    });
  });

  describe('delete method', () => {
    it('should delete existing keys', () => {
      const backingStore = new Map([['key', 'value']]);
      const vatstore = makeVatKVStore(backingStore);

      vatstore.delete('key');
      expect(vatstore.get('key')).toBeUndefined();
      expect(backingStore.has('key')).toBe(false);
    });

    it('should handle deleting non-existing keys', () => {
      const backingStore = new Map<string, string>();
      const vatstore = makeVatKVStore(backingStore);

      // Should not throw
      vatstore.delete('nonexistent');
      expect(vatstore.get('nonexistent')).toBeUndefined();
    });

    it('should remove key from sets if previously set', () => {
      const backingStore = new Map<string, string>();
      const vatstore = makeVatKVStore(backingStore);

      vatstore.set('key', 'value');
      vatstore.delete('key');

      const checkpoint = vatstore.checkpoint();
      expect(checkpoint).toStrictEqual([[], ['key']]);
    });

    it('should handle deleting keys multiple times', () => {
      const backingStore = new Map([['key', 'value']]);
      const vatstore = makeVatKVStore(backingStore);

      vatstore.delete('key');
      vatstore.delete('key'); // Second delete

      const checkpoint = vatstore.checkpoint();
      expect(checkpoint).toStrictEqual([[], ['key']]);
    });
  });

  describe('getNextKey method', () => {
    it.each([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', undefined],
    ])(
      'should return next key in sorted order: %s -> %s',
      (inputKey, expected) => {
        const backingStore = new Map([
          ['b', 'value2'],
          ['a', 'value1'],
          ['d', 'value4'],
          ['c', 'value3'],
        ]);
        const vatstore = makeVatKVStore(backingStore);

        expect(vatstore.getNextKey(inputKey)).toBe(expected);
      },
    );

    it.each([
      ['b', 'c'],
      ['d', 'e'],
      ['f', undefined],
    ])('should return first key greater than %s: %s', (inputKey, expected) => {
      const backingStore = new Map([
        ['a', 'value1'],
        ['c', 'value3'],
        ['e', 'value5'],
      ]);
      const vatstore = makeVatKVStore(backingStore);

      expect(vatstore.getNextKey(inputKey)).toBe(expected);
    });

    it('should handle empty store', () => {
      const backingStore = new Map<string, string>();
      const vatstore = makeVatKVStore(backingStore);

      expect(vatstore.getNextKey('any')).toBeUndefined();
    });

    it.each([
      ['a', 'single'],
      ['single', undefined],
      ['z', undefined],
    ])('should handle single key store: %s -> %s', (inputKey, expected) => {
      const backingStore = new Map([['single', 'value']]);
      const vatstore = makeVatKVStore(backingStore);

      expect(vatstore.getNextKey(inputKey)).toBe(expected);
    });

    it('should use cache for repeated calls with same key', () => {
      const backingStore = new Map([
        ['a', 'value1'],
        ['b', 'value2'],
        ['c', 'value3'],
      ]);
      const vatstore = makeVatKVStore(backingStore);

      // First call builds cache
      expect(vatstore.getNextKey('a')).toBe('b');
      // Second call with same key should use cache
      expect(vatstore.getNextKey('a')).toBe('b');
    });

    it('should invalidate cache when keys are modified', () => {
      const backingStore = new Map([
        ['a', 'value1'],
        ['c', 'value3'],
      ]);
      const vatstore = makeVatKVStore(backingStore);

      expect(vatstore.getNextKey('a')).toBe('c');

      // Add a key that should appear between 'a' and 'c'
      vatstore.set('b', 'value2');
      expect(vatstore.getNextKey('a')).toBe('b');
    });

    it('should handle unicode keys in sorted order', () => {
      const backingStore = new Map([
        ['🌟', 'star'],
        ['🔑', 'key'],
        ['🌍', 'world'],
      ]);
      const vatstore = makeVatKVStore(backingStore);

      // Unicode sorting order
      const firstKey = vatstore.getNextKey('');
      expect(firstKey).toBeDefined();
    });

    it('should handle empty string as key', () => {
      const backingStore = new Map([
        ['', 'empty'],
        ['a', 'value'],
      ]);
      const vatstore = makeVatKVStore(backingStore);

      expect(vatstore.getNextKey('')).toBe('a');
    });
  });

  describe('checkpoint method', () => {
    it('should return empty checkpoint when no changes', () => {
      const backingStore = new Map([['key', 'value']]);
      const vatstore = makeVatKVStore(backingStore);

      const checkpoint = vatstore.checkpoint();
      expect(checkpoint).toStrictEqual([[], []]);
    });

    it('should track only new sets', () => {
      const backingStore = new Map<string, string>();
      const vatstore = makeVatKVStore(backingStore);

      vatstore.set('key1', 'value1');
      vatstore.set('key2', 'value2');

      const checkpoint = vatstore.checkpoint();
      expect(checkpoint).toStrictEqual([
        [
          ['key1', 'value1'],
          ['key2', 'value2'],
        ],
        [],
      ]);
    });

    it('should track only deletes', () => {
      const backingStore = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ]);
      const vatstore = makeVatKVStore(backingStore);

      vatstore.delete('key1');
      vatstore.delete('key2');

      const checkpoint = vatstore.checkpoint();
      expect(checkpoint).toStrictEqual([[], ['key1', 'key2']]);
    });

    it('should track both sets and deletes', () => {
      const backingStore = new Map([['existing', 'value']]);
      const vatstore = makeVatKVStore(backingStore);

      vatstore.set('new', 'newvalue');
      vatstore.set('existing', 'updated');
      vatstore.delete('existing');

      const checkpoint = vatstore.checkpoint();
      expect(checkpoint).toStrictEqual([[['new', 'newvalue']], ['existing']]);
    });

    it('should clear tracking after checkpoint', () => {
      const backingStore = new Map<string, string>();
      const vatstore = makeVatKVStore(backingStore);

      vatstore.set('key', 'value');
      vatstore.delete('key');

      const checkpoint1 = vatstore.checkpoint();
      expect(checkpoint1).toStrictEqual([[], ['key']]);

      const checkpoint2 = vatstore.checkpoint();
      expect(checkpoint2).toStrictEqual([[], []]);
    });

    it('should handle complex sequence of operations', () => {
      const backingStore = new Map([['initial', 'value']]);
      const vatstore = makeVatKVStore(backingStore);

      // Set new key
      vatstore.set('new1', 'value1');
      // Update existing key
      vatstore.set('initial', 'updated');
      // Set and then delete
      vatstore.set('temp', 'temporary');
      vatstore.delete('temp');
      // Delete existing key
      vatstore.delete('initial');
      // Set new key after delete
      vatstore.set('new2', 'value2');

      const checkpoint = vatstore.checkpoint();
      expect(checkpoint).toStrictEqual([
        [
          ['new1', 'value1'],
          ['new2', 'value2'],
        ],
        ['temp', 'initial'],
      ]);
    });

    it('should maintain correct order in checkpoint arrays', () => {
      const backingStore = new Map<string, string>();
      const vatstore = makeVatKVStore(backingStore);

      // Add in non-alphabetical order
      vatstore.set('z', 'last');
      vatstore.set('a', 'first');
      vatstore.set('m', 'middle');

      // Delete in different order
      vatstore.delete('m');
      vatstore.delete('a');

      const checkpoint = vatstore.checkpoint();

      // Sets should be in insertion order
      expect(checkpoint[0]).toStrictEqual([['z', 'last']]);
      // Deletes should be in deletion order
      expect(checkpoint[1]).toStrictEqual(['m', 'a']);
    });
  });

  describe('integration scenarios', () => {
    it('should handle realistic vat state operations', () => {
      const backingStore = new Map([
        ['vat.state.counter', '0'],
        ['vat.exports.root', 'o+0'],
      ]);
      const vatstore = makeVatKVStore(backingStore);

      // Simulate vat execution
      vatstore.set('vat.state.counter', '1');
      vatstore.set('vat.exports.o+1', 'new-object');
      vatstore.set('vat.promises.p+1', 'pending');
      vatstore.delete('vat.temp.data');

      const checkpoint = vatstore.checkpoint();
      expect(checkpoint).toStrictEqual([
        [
          ['vat.state.counter', '1'],
          ['vat.exports.o+1', 'new-object'],
          ['vat.promises.p+1', 'pending'],
        ],
        ['vat.temp.data'],
      ]);
    });

    it('should handle large number of operations', () => {
      const backingStore = new Map<string, string>();
      const vatstore = makeVatKVStore(backingStore);

      // Add many keys
      for (let i = 0; i < 1000; i++) {
        vatstore.set(`key${i}`, `value${i}`);
      }

      // Delete some keys
      for (let i = 0; i < 100; i++) {
        vatstore.delete(`key${i}`);
      }

      const checkpoint = vatstore.checkpoint();
      expect(checkpoint[0]).toHaveLength(900); // 1000 - 100 deleted
      expect(checkpoint[1]).toHaveLength(100); // 100 deleted
    });

    it('should maintain consistency between backing store and operations', () => {
      const backingStore = new Map([
        ['a', '1'],
        ['b', '2'],
        ['c', '3'],
      ]);
      const vatstore = makeVatKVStore(backingStore);

      // Complex operations
      vatstore.set('a', 'updated-a');
      vatstore.delete('b');
      vatstore.set('d', 'new-d');
      vatstore.set('b', 'restored-b');

      // Check final state
      expect(vatstore.get('a')).toBe('updated-a');
      expect(vatstore.get('b')).toBe('restored-b');
      expect(vatstore.get('c')).toBe('3');
      expect(vatstore.get('d')).toBe('new-d');

      // Check backing store matches
      expect(backingStore.get('a')).toBe('updated-a');
      expect(backingStore.get('b')).toBe('restored-b');
      expect(backingStore.get('c')).toBe('3');
      expect(backingStore.get('d')).toBe('new-d');

      const checkpoint = vatstore.checkpoint();
      expect(checkpoint).toStrictEqual([
        [
          ['a', 'updated-a'],
          ['d', 'new-d'],
          ['b', 'restored-b'],
        ],
        [],
      ]);
    });
  });
});
