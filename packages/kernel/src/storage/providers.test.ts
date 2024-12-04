import { TestDuplexStream } from '@ocap/test-utils/streams';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { Baggage } from './baggage.js';
import { provideObject } from './providers.js';
import { VatStore } from './vat-store.js';
import { MessageResolver } from '../messages/index.js';

vi.mock('./proxy-store.js', () => ({
  ProxyStore: class {
    map = new Map<string, string>();

    constructor() {
      // Directly set invalid JSON in the store for testing
      this.map.set(`v1.vs.invalid`, '{invalid json}');
    }

    get = this.map.get.bind(this.map);

    set = this.map.set.bind(this.map);

    delete = this.map.delete.bind(this.map);

    has = this.map.has.bind(this.map);
  },
}));

describe('Storage Providers', () => {
  let mockStore: VatStore;
  let baggage: Baggage;

  beforeEach(async () => {
    mockStore = new VatStore(
      'v1',
      new TestDuplexStream(vi.fn()),
      new MessageResolver('v1'),
    );
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
