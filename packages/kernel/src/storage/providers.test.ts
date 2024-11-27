import { describe, it, expect, beforeEach } from 'vitest';

import { Baggage } from './baggage';
import { provideObject } from './providers';
import { VatStore } from './vat-store';
import { makeMapKVStore } from '../../test/storage';

describe('Storage Providers', () => {
  let mockStore: VatStore;
  let baggage: Baggage;

  beforeEach(async () => {
    const kvStore = makeMapKVStore();
    mockStore = new VatStore('v1', kvStore);
    baggage = await Baggage.create(mockStore);
  });

  describe('provideObject', () => {
    it('should return existing object if found', async () => {
      const initial = { foo: 'bar' };
      await baggage.set('test', initial);
      const result = await provideObject(baggage, 'test', {
        different: 'value',
      });
      expect(result).toStrictEqual(initial);
    });

    it('should store and return initial object if not found', async () => {
      const initial = { foo: 'bar' };
      const result = await provideObject(baggage, 'test', initial);
      expect(result).toStrictEqual(initial);
      expect(await baggage.get('test')).toStrictEqual(initial);
    });
  });
});
