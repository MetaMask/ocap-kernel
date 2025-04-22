import type {
  Message,
  VatOneResolution,
  VatSyscallObject,
} from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { VatId, KRef, VRef } from '../../types.ts';
import type { StoreContext } from '../types.ts';
import * as clistModule from './clist.ts';
import { getTranslators } from './translators.ts';
import * as vatModule from './vat.ts';

describe('getTranslators', () => {
  const mockKrefToEref = vi.fn();
  const mockErefToKref = vi.fn();
  const mockAllocateErefForKref = vi.fn();
  const mockExportFromVat = vi.fn();
  const mockCtx = {} as StoreContext;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(clistModule, 'getCListMethods').mockReturnValue({
      krefToEref: mockKrefToEref,
      erefToKref: mockErefToKref,
      allocateErefForKref: mockAllocateErefForKref,
    } as unknown as ReturnType<typeof clistModule.getCListMethods>);

    vi.spyOn(vatModule, 'getVatMethods').mockReturnValue({
      exportFromVat: mockExportFromVat,
    } as unknown as ReturnType<typeof vatModule.getVatMethods>);
  });

  describe('translateRefKtoV', () => {
    it('returns existing eref when found', () => {
      const vatId: VatId = 'v1';
      const kref: KRef = 'k1';
      const expectedEref: VRef = 'e1';
      mockKrefToEref.mockReturnValue(expectedEref);
      const { translateRefKtoV } = getTranslators(mockCtx);
      const result = translateRefKtoV(vatId, kref, false);
      expect(mockKrefToEref).toHaveBeenCalledWith(vatId, kref);
      expect(result).toStrictEqual(expectedEref);
      expect(mockAllocateErefForKref).not.toHaveBeenCalled();
    });

    it('allocates new eref when not found and importIfNeeded is true', () => {
      const vatId: VatId = 'v1';
      const kref: KRef = 'k1';
      const expectedEref: VRef = 'e1';
      mockKrefToEref.mockReturnValue(null);
      mockAllocateErefForKref.mockReturnValue(expectedEref);
      const { translateRefKtoV } = getTranslators(mockCtx);
      const result = translateRefKtoV(vatId, kref, true);
      expect(mockKrefToEref).toHaveBeenCalledWith(vatId, kref);
      expect(mockAllocateErefForKref).toHaveBeenCalledWith(vatId, kref);
      expect(result).toStrictEqual(expectedEref);
    });

    it('throws error when not found and importIfNeeded is false', () => {
      const vatId: VatId = 'v1';
      const kref: KRef = 'k1';
      mockKrefToEref.mockReturnValue(null);
      const { translateRefKtoV } = getTranslators(mockCtx);
      expect(() => translateRefKtoV(vatId, kref, false)).toThrow(
        `unmapped kref "${kref}" vat="${vatId}"`,
      );
    });
  });

  describe('translateCapDataKtoV', () => {
    it('translates capdata from kernel to vat space', () => {
      const vatId: VatId = 'v1';
      const kref1: KRef = 'k1';
      const kref2: KRef = 'k2';
      const eref1: VRef = 'e1';
      const eref2: VRef = 'e2';
      const capdata: CapData<KRef> = {
        body: 'test body',
        slots: [kref1, kref2],
      };
      const expectedCapData: CapData<VRef> = {
        body: 'test body',
        slots: [eref1, eref2],
      };
      mockKrefToEref.mockImplementation((_vId, kr) => {
        if (kr === kref1) {
          return eref1;
        }
        if (kr === kref2) {
          return eref2;
        }
        return null;
      });
      const { translateCapDataKtoV } = getTranslators(mockCtx);
      const result = translateCapDataKtoV(vatId, capdata);
      expect(result).toStrictEqual(expectedCapData);
      expect(mockKrefToEref).toHaveBeenCalledWith(vatId, kref1);
      expect(mockKrefToEref).toHaveBeenCalledWith(vatId, kref2);
    });
  });

  describe('translateMessageKtoV', () => {
    it('translates message from kernel to vat space', () => {
      const vatId: VatId = 'v1';
      const kref: KRef = 'k1';
      const resultKref: KRef = 'kr';
      const eref: VRef = 'e1';
      const resultEref: VRef = 'er';
      const message: Message = {
        methargs: {
          body: 'test method',
          slots: [kref],
        } as unknown as CapData<KRef>,
        result: resultKref,
      };
      mockKrefToEref.mockImplementation((_vId, kr) => {
        if (kr === kref) {
          return eref;
        }
        if (kr === resultKref) {
          return resultEref;
        }
        return null;
      });
      const expectedMessage: Message = {
        methargs: {
          body: 'test method',
          slots: [eref],
        } as unknown as CapData<VRef>,
        result: resultEref,
      };
      const { translateMessageKtoV } = getTranslators(mockCtx);
      const result = translateMessageKtoV(vatId, message);
      expect(result).toStrictEqual(expectedMessage);
    });

    it('handles null result in message', () => {
      const vatId: VatId = 'v1';
      const kref: KRef = 'k1';
      const eref: VRef = 'e1';
      const message: Message = {
        methargs: {
          body: 'test method',
          slots: [kref],
        } as unknown as CapData<KRef>,
        result: null,
      };
      mockKrefToEref.mockImplementation((_vId, kr) => {
        if (kr === kref) {
          return eref;
        }
        return null;
      });
      const expectedMessage: Message = {
        methargs: {
          body: 'test method',
          slots: [eref],
        } as unknown as CapData<VRef>,
        result: null,
      };
      const { translateMessageKtoV } = getTranslators(mockCtx);
      const result = translateMessageKtoV(vatId, message);
      expect(result).toStrictEqual(expectedMessage);
    });
  });

  describe('translateSyscallVtoK', () => {
    const vatId: VatId = 'v1';

    beforeEach(() => {
      mockErefToKref.mockImplementation((_vId, vr) => {
        if (vr === 'v1') {
          return 'k1';
        }
        if (vr === 'v2') {
          return 'k2';
        }
        if (vr === 'v3') {
          return 'k3';
        }
        return null;
      });
      mockExportFromVat.mockImplementation((_vId, vr) => {
        return `exported-${vr}`;
      });
    });

    it('translates "send" syscall', () => {
      const vref: VRef = 'v1';
      const kref: KRef = 'k1';
      const vMessage: Message = {
        methargs: {
          body: 'test method',
          slots: ['v2'],
        } as unknown as CapData<VRef>,
        result: 'v3',
      };
      const kMessage: Message = {
        methargs: {
          body: 'test method',
          slots: ['k2'],
        },
        result: 'k3',
      };
      const vso: VatSyscallObject = ['send', vref, vMessage];
      const expectedKso: VatSyscallObject = ['send', kref, kMessage];
      const { translateSyscallVtoK } = getTranslators(mockCtx);
      const result = translateSyscallVtoK(vatId, vso);
      expect(result).toStrictEqual(expectedKso);
    });

    it('translates "subscribe" syscall', () => {
      const vref: VRef = 'v1';
      const kref: KRef = 'k1';
      const vso: VatSyscallObject = ['subscribe', vref];
      const expectedKso: VatSyscallObject = ['subscribe', kref];
      const { translateSyscallVtoK } = getTranslators(mockCtx);
      const result = translateSyscallVtoK(vatId, vso);
      expect(result).toStrictEqual(expectedKso);
    });

    it('translates "resolve" syscall', () => {
      const vresolutions: VatOneResolution[] = [
        [
          'v1',
          false,
          { body: 'data', slots: ['v2'] } as unknown as CapData<VRef>,
        ],
      ];
      const kresoltuions: VatOneResolution[] = [
        ['k1', false, { body: 'data', slots: ['k2'] }],
      ];
      const vso: VatSyscallObject = ['resolve', vresolutions];
      const expectedKso: VatSyscallObject = ['resolve', kresoltuions];
      const { translateSyscallVtoK } = getTranslators(mockCtx);
      const result = translateSyscallVtoK(vatId, vso);
      expect(result).toStrictEqual(expectedKso);
    });

    it('translates "exit" syscall', () => {
      const vcapdata: CapData<VRef> = {
        body: 'exit info',
        slots: ['v1'],
      };
      const kcapdata: CapData<KRef> = {
        body: 'exit info',
        slots: ['k1'],
      };
      const vso: VatSyscallObject = ['exit', true, vcapdata];
      const expectedKso: VatSyscallObject = ['exit', true, kcapdata];
      const { translateSyscallVtoK } = getTranslators(mockCtx);
      const result = translateSyscallVtoK(vatId, vso);
      expect(result).toStrictEqual(expectedKso);
    });

    it.each([
      'dropImports',
      'retireImports',
      'retireExports',
      'abandonExports',
    ])('translates "%s" syscall', (op) => {
      const vrefs: VRef[] = ['v1', 'v2'];
      const krefs: KRef[] = ['k1', 'k2'];
      const vso: VatSyscallObject = [op, vrefs] as VatSyscallObject;
      const expectedKso: VatSyscallObject = [op, krefs] as VatSyscallObject;
      const { translateSyscallVtoK } = getTranslators(mockCtx);
      const result = translateSyscallVtoK(vatId, vso);
      expect(result).toStrictEqual(expectedKso);
    });

    it.each([
      'callNow',
      'vatstoreGet',
      'vatstoreGetNextKey',
      'vatstoreSet',
      'vatstoreDelete',
    ])('throws error for invalid syscall "%s"', (op) => {
      const vso: VatSyscallObject = [op] as unknown as VatSyscallObject;
      const { translateSyscallVtoK } = getTranslators(mockCtx);
      expect(() => translateSyscallVtoK(vatId, vso)).toThrow(
        `vat ${vatId} issued invalid syscall ${op}`,
      );
    });

    it('throws error for unknown syscall type', () => {
      const vso: VatSyscallObject = ['unknown'] as unknown as VatSyscallObject;
      const { translateSyscallVtoK } = getTranslators(mockCtx);
      expect(() => translateSyscallVtoK(vatId, vso)).toThrow(
        `vat ${vatId} issued unknown syscall unknown`,
      );
    });
  });
});
