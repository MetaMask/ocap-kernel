import { describe, it, expect, beforeEach } from 'vitest';

import type { VatId, VatConfig } from './types';
import { VatStateService } from './vat-state-service';

describe('VatStateService', () => {
  let vatStateService: VatStateService;
  const mockVatId: VatId = 'v1';
  const mockVatConfig: VatConfig = { sourceSpec: 'test-vat.js' };
  const mockVatState = { config: mockVatConfig };

  beforeEach(() => {
    vatStateService = new VatStateService();
  });

  describe('set', () => {
    it('should store valid vat state', () => {
      vatStateService.set(mockVatId, mockVatState);
      expect(vatStateService.get(mockVatId)).toStrictEqual(mockVatState);
    });

    it('should overwrite existing state', () => {
      const newState = { config: { sourceSpec: 'new.js' } };
      vatStateService.set(mockVatId, mockVatState);
      vatStateService.set(mockVatId, newState);
      expect(vatStateService.get(mockVatId)).toStrictEqual(newState);
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent vat', () => {
      expect(vatStateService.get('v999')).toBeUndefined();
    });

    it('should return correct state for existing vat', () => {
      vatStateService.set(mockVatId, mockVatState);
      expect(vatStateService.get(mockVatId)).toStrictEqual(mockVatState);
    });
  });

  describe('delete', () => {
    it('should return true when deleting existing state', () => {
      vatStateService.set(mockVatId, mockVatState);
      expect(vatStateService.delete(mockVatId)).toBe(true);
      expect(vatStateService.get(mockVatId)).toBeUndefined();
    });

    it('should return false when deleting non-existent state', () => {
      expect(vatStateService.delete('v999')).toBe(false);
    });
  });

  describe('has', () => {
    it('should return true for existing vat', () => {
      vatStateService.set(mockVatId, mockVatState);
      expect(vatStateService.has(mockVatId)).toBe(true);
    });

    it('should return false for non-existent vat', () => {
      expect(vatStateService.has('v999')).toBe(false);
    });
  });

  describe('vatIds', () => {
    it('should return all vat IDs', () => {
      vatStateService.set('v1', mockVatState);
      vatStateService.set('v2', mockVatState);
      expect(vatStateService.vatIds).toStrictEqual(['v1', 'v2']);
    });

    it('should return empty array when no states exist', () => {
      expect(vatStateService.vatIds).toStrictEqual([]);
    });
  });

  describe('size', () => {
    it('should return correct number of stored states', () => {
      expect(vatStateService.size).toBe(0);
      vatStateService.set('v1', mockVatState);
      expect(vatStateService.size).toBe(1);
      vatStateService.set('v2', mockVatState);
      expect(vatStateService.size).toBe(2);
      vatStateService.delete('v1');
      expect(vatStateService.size).toBe(1);
    });
  });
});
