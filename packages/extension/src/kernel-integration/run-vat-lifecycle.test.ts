import '../../../test-utils/src/env/mock-endo.ts';
import { define } from '@metamask/superstruct';
import type { NonEmptyArray } from '@metamask/utils';
import { Kernel, VatCommandMethod } from '@ocap/kernel';
import type { Vat, VatId, VatConfig } from '@ocap/kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { runVatLifecycle } from './run-vat-lifecycle';

// Mock kernel validation functions
vi.mock('@ocap/kernel', () => ({
  isVatId: () => true,
  VatIdStruct: define<VatId>('VatId', () => true),
  VatCommandMethod: {
    ping: 'ping',
  },
}));

describe('runVatLifecycle', () => {
  // Properly type the mock kernel with Vi.Mock types
  const mockKernel = {
    launchVat: vi.fn(() => ({}) as Vat),
    restartVat: vi.fn(() => undefined),
    sendMessage: vi.fn(),
    terminateAllVats: vi.fn(() => undefined),
    getVatIds: vi.fn(() => ['v1', 'v2']),
  } as unknown as Kernel;

  // Define test vats with correct VatConfig format
  const testVats: NonEmptyArray<VatConfig> = [
    { sourceSpec: 'bogus1.js' },
    { sourceSpec: 'bogus2.js' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'time').mockImplementation(() => undefined);
    vi.spyOn(console, 'timeEnd').mockImplementation(() => undefined);
  });

  it.todo('should execute the complete vat lifecycle', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    // Make Math.random return 0 for predictable vat selection
    vi.spyOn(Math, 'random').mockReturnValue(0);

    await runVatLifecycle(mockKernel, testVats);

    // Verify vat creation
    expect(mockKernel.launchVat).toHaveBeenCalledTimes(2);
    expect(mockKernel.launchVat).toHaveBeenCalledWith({ id: 'v1' });
    expect(mockKernel.launchVat).toHaveBeenCalledWith({ id: 'v2' });

    // Verify vat restart
    expect(mockKernel.restartVat).toHaveBeenCalledWith('v1');

    // Verify ping message
    expect(mockKernel.sendMessage).toHaveBeenCalledWith('v1', {
      method: VatCommandMethod.ping,
      params: null,
    });

    // Verify vat termination
    expect(mockKernel.terminateAllVats).toHaveBeenCalled();

    // Verify logger calls
    expect(consoleSpy).toHaveBeenCalledWith('Kernel vats:', 'v1, v2');
    expect(consoleSpy).toHaveBeenCalledWith('Kernel has 2 vats');
  });

  it.todo('should handle errors during vat lifecycle', async () => {
    // Mock an error during vat launch
    vi.mocked(mockKernel.launchVat).mockRejectedValue(
      new Error('Launch failed'),
    );

    await expect(runVatLifecycle(mockKernel, testVats)).rejects.toThrow(
      'Launch failed',
    );
  });
});
