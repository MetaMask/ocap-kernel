import { describe, it, expect, vi, beforeEach } from 'vitest';

import { VatAlreadyExistsError, VatNotFoundError } from './errors.js';
import { Kernel } from './Kernel.js';
import type { VatCommand } from './messages.js';
import type { VatId, VatWorker } from './types.js';
import { Vat } from './Vat.js';

describe('Kernel', () => {
  let mockWorker: VatWorker;
  let initMock: unknown;
  let terminateMock: unknown;

  beforeEach(() => {
    vi.resetAllMocks();

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
      await kernel.launchVat({ id: 'v0', worker: mockWorker });
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
    });

    it('returns multiple vat IDs after adding multiple vats', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'v0', worker: mockWorker });
      await kernel.launchVat({ id: 'v1', worker: mockWorker });
      expect(kernel.getVatIds()).toStrictEqual(['v0', 'v1']);
    });
  });

  describe('launchVat()', () => {
    it('adds a vat to the kernel without errors when no vat with the same ID exists', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'v0', worker: mockWorker });
      expect(initMock).toHaveBeenCalledOnce();
      expect(mockWorker.init).toHaveBeenCalled();
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
    });

    it('throws an error when launching a vat that already exists in the kernel', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'v0', worker: mockWorker });
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
      await expect(
        kernel.launchVat({
          id: 'v0',
          worker: mockWorker,
        }),
      ).rejects.toThrow(VatAlreadyExistsError);
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
    });
  });

  describe('deleteVat()', () => {
    it('deletes a vat from the kernel without errors when the vat exists', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'v0', worker: mockWorker });
      expect(kernel.getVatIds()).toStrictEqual(['v0']);
      await kernel.deleteVat('v0');
      expect(terminateMock).toHaveBeenCalledOnce();
      expect(mockWorker.delete).toHaveBeenCalledOnce();
      expect(kernel.getVatIds()).toStrictEqual([]);
    });

    it('throws an error when deleting a vat that does not exist in the kernel', async () => {
      const kernel = new Kernel();
      const nonExistentVatId: VatId = 'v9';
      await expect(async () =>
        kernel.deleteVat(nonExistentVatId),
      ).rejects.toThrow(VatNotFoundError);
      expect(terminateMock).not.toHaveBeenCalled();
    });

    it('throws an error when a vat terminate method throws', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'v0', worker: mockWorker });
      vi.spyOn(Vat.prototype, 'terminate').mockRejectedValueOnce('Test error');
      await expect(async () => kernel.deleteVat('v0')).rejects.toThrow(
        'Test error',
      );
    });
  });

  describe('sendMessage()', () => {
    it('sends a message to the vat without errors when the vat exists', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'v0', worker: mockWorker });
      vi.spyOn(Vat.prototype, 'sendMessage').mockResolvedValueOnce('test');
      expect(
        await kernel.sendMessage(
          'v0',
          'test' as unknown as VatCommand['payload'],
        ),
      ).toBe('test');
    });

    it('throws an error when sending a message to the vat that does not exist in the kernel', async () => {
      const kernel = new Kernel();
      const nonExistentVatId: VatId = 'v9';
      await expect(async () =>
        kernel.sendMessage(nonExistentVatId, {} as VatCommand['payload']),
      ).rejects.toThrow(VatNotFoundError);
    });

    it('throws an error when sending a message to the vat throws', async () => {
      const kernel = new Kernel();
      await kernel.launchVat({ id: 'v0', worker: mockWorker });
      vi.spyOn(Vat.prototype, 'sendMessage').mockRejectedValueOnce('error');
      await expect(async () =>
        kernel.sendMessage('v0', {} as VatCommand['payload']),
      ).rejects.toThrow('error');
    });
  });

  describe('constructor()', () => {
    it('initializes the kernel without errors', () => {
      expect(async () => new Kernel()).not.toThrow();
    });
  });
});
