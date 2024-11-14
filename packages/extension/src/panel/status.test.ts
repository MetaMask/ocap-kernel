import '../../../test-utils/src/env/mock-endo.js';
import { define } from '@metamask/superstruct';
import type { VatId } from '@ocap/kernel';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { setupPanelDOM } from '../../test/panel-utils.js';

const isVatId = vi.fn(
  (input: unknown): input is VatId => typeof input === 'string',
);

vi.mock('@ocap/kernel', () => ({
  isVatId,
  VatIdStruct: define<VatId>('VatId', isVatId),
}));

describe('status', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    await setupPanelDOM();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  describe('setupStatusPolling', () => {
    it('should start polling for status', async () => {
      const { setupStatusPolling } = await import('./status');
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      vi.useFakeTimers();

      const pollingPromise = setupStatusPolling(sendMessage);

      // First immediate call
      expect(sendMessage).toHaveBeenCalledWith({
        method: 'getStatus',
        params: null,
      });

      // Advance timer to trigger next poll
      await vi.advanceTimersByTimeAsync(1000);

      expect(sendMessage).toHaveBeenCalledTimes(2);

      await pollingPromise;
    });
  });

  describe('updateStatusDisplay', () => {
    it('should display running status with active vats', async () => {
      const { updateStatusDisplay } = await import('./status');
      const activeVats: VatId[] = ['v0', 'v1', 'v2'];

      updateStatusDisplay({
        isRunning: true,
        activeVats,
      });

      const statusDisplay = document.getElementById('status-display');
      expect(statusDisplay?.textContent).toBe(
        `Active Vats (3): ["v0","v1","v2"]`,
      );
    });

    it('should display not running status', async () => {
      const { updateStatusDisplay } = await import('./status');

      updateStatusDisplay({
        isRunning: false,
        activeVats: [],
      });

      const statusDisplay = document.getElementById('status-display');
      expect(statusDisplay?.textContent).toBe('Kernel is not running');
    });

    it('should update vat select options', async () => {
      const { updateStatusDisplay } = await import('./status');
      const activeVats: VatId[] = ['v0', 'v1'];

      updateStatusDisplay({
        isRunning: true,
        activeVats,
      });

      const vatSelect = document.getElementById('vat-id') as HTMLSelectElement;
      expect(vatSelect.options).toHaveLength(3); // Including empty option
      expect(vatSelect.options[1]?.value).toBe('v0');
      expect(vatSelect.options[2]?.value).toBe('v1');
    });

    it('should preserve selected vat if still active', async () => {
      const { updateStatusDisplay } = await import('./status');
      const vatSelect = document.getElementById('vat-id') as HTMLSelectElement;

      // First update
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v0', 'v1'],
      });
      vatSelect.value = 'v1';

      // Second update with same vat still active
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v0', 'v1', 'v2'],
      });

      expect(vatSelect.value).toBe('v1');
    });

    it('should clear selection if selected vat becomes inactive', async () => {
      const { updateStatusDisplay } = await import('./status');
      const vatSelect = document.getElementById('vat-id') as HTMLSelectElement;

      // First update and selection
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v0', 'v1'],
      });
      vatSelect.value = 'v1';

      // Second update with selected vat removed
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v0'],
      });

      expect(vatSelect.value).toBe('');
    });

    it('should skip vat select update if vats have not changed', async () => {
      const { updateStatusDisplay } = await import('./status');
      const vatSelect = document.getElementById('vat-id') as HTMLSelectElement;
      const activeVats: VatId[] = ['v0', 'v1'];

      // First update
      updateStatusDisplay({
        isRunning: true,
        activeVats,
      });

      // Store original options for comparison
      const originalOptions = Array.from(vatSelect.options);

      // Update with same vats in same order
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v0', 'v1'],
      });

      // Compare options after update
      const newOptions = Array.from(vatSelect.options);
      expect(newOptions).toStrictEqual(originalOptions);

      // Verify the options are the actual same DOM elements (not just equal)
      newOptions.forEach((option, index) => {
        expect(option).toBe(originalOptions[index]);
      });
    });

    it('should update vat select if vats are same but in different order', async () => {
      const { updateStatusDisplay } = await import('./status');
      const vatSelect = document.getElementById('vat-id') as HTMLSelectElement;

      // First update
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v0', 'v1'],
      });

      // Store original options for comparison
      const originalOptions = Array.from(vatSelect.options);

      // Update with same vats in different order
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v1', 'v0'],
      });

      // Compare options after update
      const newOptions = Array.from(vatSelect.options);
      expect(newOptions).not.toStrictEqual(originalOptions);
      expect(vatSelect.options[1]?.value).toBe('v1');
      expect(vatSelect.options[2]?.value).toBe('v0');
    });
  });

  describe('setupVatListeners', () => {
    it('should update button states on vat id input', async () => {
      const { setupVatListeners } = await import('./status');
      const { buttons } = await import('./buttons');
      const newVatId = document.getElementById(
        'new-vat-id',
      ) as HTMLInputElement;

      setupVatListeners();

      // Empty input
      newVatId.value = '';
      newVatId.dispatchEvent(new Event('input'));
      expect(buttons.launchVat?.element.disabled).toBe(true);

      // Non-empty input
      newVatId.value = 'v3';
      newVatId.dispatchEvent(new Event('input'));
      expect(buttons.launchVat?.element.disabled).toBe(false);
    });

    it('should update button states on vat selection change', async () => {
      const { setupVatListeners } = await import('./status');
      const { buttons } = await import('./buttons');
      const vatSelect = document.getElementById('vat-id') as HTMLSelectElement;

      setupVatListeners();

      // No selection
      vatSelect.value = '';
      vatSelect.dispatchEvent(new Event('change'));
      expect(buttons.restartVat?.element.disabled).toBe(true);
      expect(buttons.terminateVat?.element.disabled).toBe(true);

      // With selection
      vatSelect.value = 'v0';
      vatSelect.dispatchEvent(new Event('change'));
      expect(buttons.restartVat?.element.disabled).toBe(false);
      expect(buttons.terminateVat?.element.disabled).toBe(false);
    });
  });
});
