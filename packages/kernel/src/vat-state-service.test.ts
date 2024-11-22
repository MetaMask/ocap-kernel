import { describe, it, expect, beforeEach } from 'vitest';

import type { VatId, VatConfig } from './types';
import { VatStateService } from './vat-state-service';
import type { VatState } from './vat-state-service';

describe('VatStateService', () => {
  let vatStateService: VatStateService;
  const mockVatId: VatId = 'v1';
  const mockVatConfig: VatConfig = { sourceSpec: 'test-vat.js' };
  const mockVatState: VatState = { config: mockVatConfig };

  beforeEach(() => {
    vatStateService = new VatStateService();
  });

  describe('saveVatState', () => {
    it('should save vat state', () => {
      vatStateService.saveVatState(mockVatId, mockVatState);
      const savedState = vatStateService.getVatState(mockVatId);
      expect(savedState).toStrictEqual(mockVatState);
    });

    it('should overwrite existing vat state', () => {
      const initialState: VatState = {
        config: { sourceSpec: 'initial.js' },
      };
      vatStateService.saveVatState(mockVatId, initialState);

      const updatedState: VatState = {
        config: { sourceSpec: 'updated.js' },
      };
      vatStateService.saveVatState(mockVatId, updatedState);

      const savedState = vatStateService.getVatState(mockVatId);
      expect(savedState).toStrictEqual(updatedState);
      expect(savedState).not.toStrictEqual(initialState);
    });
  });

  describe('getVatState', () => {
    it('should return undefined for non-existent vat', () => {
      const state = vatStateService.getVatState('v999');
      expect(state).toBeUndefined();
    });

    it('should return correct state for existing vat', () => {
      vatStateService.saveVatState(mockVatId, mockVatState);
      const state = vatStateService.getVatState(mockVatId);
      expect(state).toStrictEqual(mockVatState);
    });
  });

  describe('deleteVatState', () => {
    it('should delete existing vat state', () => {
      vatStateService.saveVatState(mockVatId, mockVatState);
      vatStateService.deleteVatState(mockVatId);
      const state = vatStateService.getVatState(mockVatId);
      expect(state).toBeUndefined();
    });

    it('should not throw when deleting non-existent vat state', () => {
      expect(() => vatStateService.deleteVatState('v999')).not.toThrow();
    });
  });

  describe('multiple vats', () => {
    it('should handle multiple vat states independently', () => {
      const vat1State: VatState = { config: { sourceSpec: 'vat1.js' } };
      const vat2State: VatState = { config: { sourceSpec: 'vat2.js' } };

      vatStateService.saveVatState('v1', vat1State);
      vatStateService.saveVatState('v2', vat2State);

      expect(vatStateService.getVatState('v1')).toStrictEqual(vat1State);
      expect(vatStateService.getVatState('v2')).toStrictEqual(vat2State);

      vatStateService.deleteVatState('v1');
      expect(vatStateService.getVatState('v1')).toBeUndefined();
      expect(vatStateService.getVatState('v2')).toStrictEqual(vat2State);
    });
  });
});
