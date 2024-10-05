import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Command } from './command.js';
import { Kernel } from './Kernel.js';
import type { VatWorker } from './types.js';
import { Vat } from './Vat.js';

describe('Kernel', () => {
  let mockWorker: VatWorker;
  let initMock: unknown;
  let terminateMock: unknown;

  beforeEach(() => {
    mockWorker = {
      init: vi.fn().mockResolvedValue([{}]),
      delete: vi.fn(),
    };

    initMock = vi.spyOn(Vat.prototype, 'init').mockImplementation(vi.fn());
    terminateMock = vi
      .spyOn(Vat.prototype, 'terminate')
      .mockImplementation(vi.fn());
  });

  describe('getVatIds()', () => {
    it('returns an empty array when no vats are added', () => {
      const kernel = new Kernel();
      expect(kernel.getVatIds()).toStrictEqual([]);
    });

    it('returns the vat IDs after adding a vat', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'vat-id-1', worker: mockWorker });
      expect(kernel.getVatIds()).toStrictEqual(['vat-id-1']);
    });

    it('returns multiple vat IDs after adding multiple vats', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'vat-id-1', worker: mockWorker });
      await kernel.launchVat({ id: 'vat-id-2', worker: mockWorker });
      expect(kernel.getVatIds()).toStrictEqual(['vat-id-1', 'vat-id-2']);
    });
  });

  describe('launchVat()', () => {
    it('adds a vat to the kernel without errors when no vat with the same ID exists', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'vat-id-1', worker: mockWorker });
      expect(initMock).toHaveBeenCalledOnce();
      expect(mockWorker.init).toHaveBeenCalled();
      expect(kernel.getVatIds()).toStrictEqual(['vat-id-1']);
    });

    it('throws an error when launching a vat that already exists in the kernel', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'vat-id-1', worker: mockWorker });
      expect(kernel.getVatIds()).toStrictEqual(['vat-id-1']);
      await expect(
        kernel.launchVat({
          id: 'vat-id-1',
          worker: mockWorker,
        }),
      ).rejects.toThrow('Vat with ID vat-id-1 already exists.');
      expect(kernel.getVatIds()).toStrictEqual(['vat-id-1']);
    });
  });

  describe('deleteVat()', () => {
    it('deletes a vat from the kernel without errors when the vat exists', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'vat-id', worker: mockWorker });
      expect(kernel.getVatIds()).toStrictEqual(['vat-id']);
      await kernel.deleteVat('vat-id');
      expect(terminateMock).toHaveBeenCalledOnce();
      expect(mockWorker.delete).toHaveBeenCalledOnce();
      expect(kernel.getVatIds()).toStrictEqual([]);
    });

    it('throws an error when deleting a vat that does not exist in the kernel', async () => {
      const kernel = new Kernel();
      await expect(async () =>
        kernel.deleteVat('non-existent-vat-id'),
      ).rejects.toThrow('Vat with ID non-existent-vat-id does not exist.');
      expect(terminateMock).not.toHaveBeenCalled();
    });

    it('throws an error when a vat terminate method throws', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'vat-id', worker: mockWorker });
      vi.spyOn(Vat.prototype, 'terminate').mockRejectedValueOnce('Test error');
      await expect(async () => kernel.deleteVat('vat-id')).rejects.toThrow(
        'Test error',
      );
    });
  });

  describe('sendMessage()', () => {
    it('sends a message to the vat without errors when the vat exists', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'vat-id', worker: mockWorker });
      vi.spyOn(Vat.prototype, 'sendMessage').mockResolvedValueOnce('test');
      expect(
        await kernel.sendMessage('vat-id', 'test' as unknown as Command),
      ).toBe('test');
    });

    it('throws an error when sending a message to the vat that does not exist in the kernel', async () => {
      const kernel = new Kernel();
      await expect(async () =>
        kernel.sendMessage('non-existent-vat-id', {} as Command),
      ).rejects.toThrow('Vat with ID non-existent-vat-id does not exist.');
    });

    it('throws an error when sending a message to the vat throws', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'vat-id', worker: mockWorker });
      vi.spyOn(Vat.prototype, 'sendMessage').mockRejectedValueOnce('error');
      await expect(async () =>
        kernel.sendMessage('vat-id', {} as Command),
      ).rejects.toThrow('error');
    });
  });

  describe('constructor()', () => {
    it('initializes the kernel without errors', () => {
      expect(async () => new Kernel()).not.toThrow();
    });
  });
});
