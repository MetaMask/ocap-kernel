import type { VatMessage } from '@ocap/streams';
import { describe, it, expect, vi } from 'vitest';

import { Kernel } from './Kernel.js';
import type { Vat } from './Vat.js';

describe('Kernel', () => {
  describe('#getVatIDs()', () => {
    it('returns an empty array when no vats are added', () => {
      const kernel = new Kernel();
      expect(kernel.getVatIDs()).toStrictEqual([]);
    });

    it('returns the vat IDs after adding a vat', () => {
      const kernel = new Kernel();
      kernel.addVat({ id: 'vat-id-1' } as Vat);
      expect(kernel.getVatIDs()).toStrictEqual(['vat-id-1']);
    });

    it('returns multiple vat IDs after adding multiple vats', () => {
      const kernel = new Kernel();
      kernel.addVat({ id: 'vat-id-1' } as Vat);
      kernel.addVat({ id: 'vat-id-2' } as Vat);
      expect(kernel.getVatIDs()).toStrictEqual(['vat-id-1', 'vat-id-2']);
    });
  });

  describe('#addVat()', () => {
    it('adds a vat to the kernel without errors when no vat with the same ID exists', () => {
      const kernel = new Kernel();
      kernel.addVat({ id: 'vat-id' } as Vat);
      expect(kernel.getVatIDs()).toStrictEqual(['vat-id']);
    });

    it('throws an error when adding a vat that already exists in the kernel', () => {
      const kernel = new Kernel();
      kernel.addVat({ id: 'vat-id-1' } as Vat);
      expect(kernel.getVatIDs()).toStrictEqual(['vat-id-1']);
      expect(() => kernel.addVat({ id: 'vat-id-1' } as Vat)).toThrow(
        'Vat with ID vat-id-1 already exists.',
      );
      expect(kernel.getVatIDs()).toStrictEqual(['vat-id-1']);
    });
  });

  describe('#deleteVat()', () => {
    it('deletes a vat from the kernel without errors when the vat exists', async () => {
      const kernel = new Kernel();
      kernel.addVat({ id: 'vat-id', terminate: vi.fn() } as unknown as Vat);
      expect(kernel.getVatIDs()).toStrictEqual(['vat-id']);
      await kernel.deleteVat('vat-id');
      expect(kernel.getVatIDs()).toStrictEqual([]);
    });

    it('throws an error when deleting a vat that does not exist in the kernel', async () => {
      const kernel = new Kernel();
      await expect(async () =>
        kernel.deleteVat('non-existent-vat-id'),
      ).rejects.toThrow('Vat with ID non-existent-vat-id does not exist.');
    });

    it('throws an error when a vat terminate method throws', async () => {
      const kernel = new Kernel();
      kernel.addVat({
        id: 'vat-id',
        terminate: () => {
          throw new Error('Test error');
        },
      } as unknown as Vat);
      await expect(async () => kernel.deleteVat('vat-id')).rejects.toThrow(
        'Test error',
      );
    });
  });

  describe('#sendMessage()', () => {
    it('sends a message to the vat without errors when the vat exists', async () => {
      const kernel = new Kernel();
      kernel.addVat({
        id: 'vat-id',
        sendMessage: async (prop) => Promise.resolve(prop),
      } as Vat);
      expect(
        await kernel.sendMessage('vat-id', 'test' as unknown as VatMessage),
      ).toBe('test');
    });

    it('throws an error when sending a message to the vat that does not exist in the kernel', async () => {
      const kernel = new Kernel();
      await expect(async () =>
        kernel.sendMessage('non-existent-vat-id', {} as VatMessage),
      ).rejects.toThrow('Vat with ID non-existent-vat-id does not exist.');
    });

    it('throws an error when sending a message to the vat throws', async () => {
      const kernel = new Kernel();
      kernel.addVat({
        id: 'vat-id',
        sendMessage: async () => Promise.reject(new Error('Test error')),
      } as unknown as Vat);
      await expect(async () =>
        kernel.sendMessage('vat-id', {} as VatMessage),
      ).rejects.toThrow('Test error');
    });
  });

  describe('#constructor()', () => {
    it('initializes the kernel without errors', () => {
      expect(async () => new Kernel()).not.toThrow();
    });
  });
});
