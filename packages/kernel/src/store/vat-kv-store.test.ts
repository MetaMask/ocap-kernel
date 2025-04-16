import { describe, it, expect } from 'vitest';

import { makeVatKVStore } from './VatKVStore.ts';

describe('VatKVStore', () => {
  it('working VatKVStore', () => {
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
      new Map([
        ['key2', 'revisedValue2'],
        ['key4', 'value4'],
      ]),
      new Set(['key1']),
    ]);

    const checkpoint2 = vatstore.checkpoint();
    expect(checkpoint2).toStrictEqual([new Map(), new Set()]);

    expect(backingStore).toStrictEqual(
      new Map([
        ['key2', 'revisedValue2'],
        ['key3', 'value3'],
        ['key4', 'value4'],
      ]),
    );
  });
});
