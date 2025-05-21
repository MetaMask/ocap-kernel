import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { StoreContext } from '../types.ts';
import { getCompromisedMethods } from './compromised.ts';

describe('compromised vat methods', () => {
  let ctx: StoreContext;
  let compromisedVatsMock: {
    get: MockInstance;
    set: MockInstance;
  };
  let methods: ReturnType<typeof getCompromisedMethods>;

  beforeEach(() => {
    // Create mock for the context's compromisedVats
    compromisedVatsMock = {
      get: vi.fn(),
      set: vi.fn(),
    };

    // Initialize the mock context
    ctx = {
      compromisedVats: compromisedVatsMock,
    } as unknown as StoreContext;

    // Initialize with empty compromised vats array
    compromisedVatsMock.get.mockReturnValue('[]');

    // Get the methods to test
    methods = getCompromisedMethods(ctx);
  });

  describe('getCompromisedVats', () => {
    it('returns an empty array when no vats are compromised', () => {
      const result = methods.getCompromisedVats();
      expect(result).toStrictEqual([]);
      expect(compromisedVatsMock.get).toHaveBeenCalled();
    });

    it('returns array of compromised vat IDs', () => {
      compromisedVatsMock.get.mockReturnValueOnce('["v1", "v3"]');
      const result = methods.getCompromisedVats();
      expect(result).toStrictEqual(['v1', 'v3']);
    });

    it('handles null return from store by returning empty array', () => {
      compromisedVatsMock.get.mockReturnValueOnce(null);
      const result = methods.getCompromisedVats();
      expect(result).toStrictEqual([]);
    });
  });

  describe('isVatCompromised', () => {
    it('returns false for uncompromised vat', () => {
      compromisedVatsMock.get.mockReturnValueOnce('["v1", "v3"]');
      const result = methods.isVatCompromised('v2');
      expect(result).toBe(false);
    });

    it('returns true for compromised vat', () => {
      compromisedVatsMock.get.mockReturnValueOnce('["v1", "v3"]');
      const result = methods.isVatCompromised('v3');
      expect(result).toBe(true);
    });
  });

  describe('markVatAsCompromised', () => {
    it('adds vat to compromised list when not already marked', () => {
      compromisedVatsMock.get.mockReturnValueOnce('["v1"]');
      methods.markVatAsCompromised('v2');
      expect(compromisedVatsMock.set).toHaveBeenCalledWith('["v1","v2"]');
    });

    it('does not modify list when vat is already marked as compromised', () => {
      compromisedVatsMock.get.mockReturnValueOnce('["v1", "v2"]');
      methods.markVatAsCompromised('v2');
      expect(compromisedVatsMock.set).not.toHaveBeenCalled();
    });

    it('initializes list when none exists', () => {
      compromisedVatsMock.get.mockReturnValueOnce(null);
      methods.markVatAsCompromised('v1');
      expect(compromisedVatsMock.set).toHaveBeenCalledWith('["v1"]');
    });
  });

  describe('clearVatCompromisedStatus', () => {
    it('removes vat from compromised list', () => {
      compromisedVatsMock.get.mockReturnValueOnce('["v1","v2","v3"]');
      methods.clearVatCompromisedStatus('v2');
      expect(compromisedVatsMock.set).toHaveBeenCalledWith('["v1","v3"]');
    });

    it('does nothing if vat is not in compromised list', () => {
      compromisedVatsMock.get.mockReturnValueOnce('["v1","v3"]');
      methods.clearVatCompromisedStatus('v2');
      expect(compromisedVatsMock.set).toHaveBeenCalledWith('["v1","v3"]');
    });

    it('clears empty list when last vat is removed', () => {
      compromisedVatsMock.get.mockReturnValueOnce('["v1"]');
      methods.clearVatCompromisedStatus('v1');
      expect(compromisedVatsMock.set).toHaveBeenCalledWith('[]');
    });
  });
});
