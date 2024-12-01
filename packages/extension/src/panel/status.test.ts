import '@ocap/test-utils/mock-endoify';
import { define } from '@metamask/superstruct';
import type { VatId } from '@ocap/kernel';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { setupPanelDOM } from '../../test/helpers/panel-utils.js';

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
      vi.useFakeTimers();
      const { setupStatusPolling } = await import('./status');
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      const cleanup = await setupStatusPolling(sendMessage);
      expect(sendMessage).toHaveBeenCalledWith({
        method: 'getStatus',
        params: null,
      });
      // Advance timers to trigger the next poll
      await vi.advanceTimersByTimeAsync(1000);
      // Wait for any pending promises to resolve
      await Promise.resolve();
      expect(sendMessage).toHaveBeenCalledTimes(2);
      cleanup();
      vi.clearAllTimers();
    });
  });

  describe('updateStatusDisplay', () => {
    it('should display running status with active vats', async () => {
      const { updateStatusDisplay, statusDisplay } = await import('./status');

      const activeVats: VatId[] = ['v0', 'v1', 'v2'];

      updateStatusDisplay({
        isRunning: true,
        activeVats,
      });

      expect(statusDisplay?.textContent).toBe(
        `Active Vats (3): ["v0","v1","v2"]`,
      );
    });

    it('should display not running status', async () => {
      const { updateStatusDisplay, statusDisplay } = await import('./status');

      updateStatusDisplay({
        isRunning: false,
        activeVats: [],
      });

      expect(statusDisplay?.textContent).toBe('Kernel is not running');
    });

    it('should update vat select options', async () => {
      const { updateStatusDisplay } = await import('./status');
      const { vatDropdown } = await import('./buttons');
      const activeVats: VatId[] = ['v0', 'v1'];

      updateStatusDisplay({
        isRunning: true,
        activeVats,
      });

      expect(vatDropdown.options).toHaveLength(3); // Including empty option
      expect(vatDropdown.options[1]?.value).toBe('v0');
      expect(vatDropdown.options[2]?.value).toBe('v1');
    });

    it('should preserve selected vat if still active', async () => {
      const { updateStatusDisplay } = await import('./status');
      const { vatDropdown } = await import('./buttons');
      // First update
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v0', 'v1'],
      });
      vatDropdown.value = 'v1';

      // Second update with same vat still active
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v0', 'v1', 'v2'],
      });

      expect(vatDropdown.value).toBe('v1');
    });

    it('should clear selection if selected vat becomes inactive', async () => {
      const { updateStatusDisplay } = await import('./status');
      const { vatDropdown } = await import('./buttons');

      // First update and selection
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v0', 'v1'],
      });
      vatDropdown.value = 'v1';

      // Second update with selected vat removed
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v0'],
      });

      expect(vatDropdown.value).toBe('');
    });

    it('should skip vat select update if vats have not changed', async () => {
      const { updateStatusDisplay } = await import('./status');
      const { vatDropdown } = await import('./buttons');

      const activeVats: VatId[] = ['v0', 'v1'];

      // First update
      updateStatusDisplay({
        isRunning: true,
        activeVats,
      });

      // Store original options for comparison
      const originalOptions = Array.from(vatDropdown.options);

      // Update with same vats in same order
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v0', 'v1'],
      });

      // Compare options after update
      const newOptions = Array.from(vatDropdown.options);
      expect(newOptions).toStrictEqual(originalOptions);

      // Verify the options are the actual same DOM elements (not just equal)
      newOptions.forEach((option, index) => {
        expect(option).toBe(originalOptions[index]);
      });
    });

    it('should update vat select if vats are same but in different order', async () => {
      const { updateStatusDisplay } = await import('./status');
      const { vatDropdown } = await import('./buttons');

      // First update
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v0', 'v1'],
      });

      // Store original options for comparison
      const originalOptions = Array.from(vatDropdown.options);

      // Update with same vats in different order
      updateStatusDisplay({
        isRunning: true,
        activeVats: ['v1', 'v0'],
      });

      // Compare options after update
      const newOptions = Array.from(vatDropdown.options);
      expect(newOptions).not.toStrictEqual(originalOptions);
      expect(vatDropdown.options[1]?.value).toBe('v1');
      expect(vatDropdown.options[2]?.value).toBe('v0');
    });
  });

  describe('setupVatListeners', () => {
    it('should update launch vat button state', async () => {
      const { setupVatListeners } = await import('./status');
      const { buttons, newVatName, bundleUrl } = await import('./buttons');

      setupVatListeners();

      newVatName.value = '';
      bundleUrl.value = '';
      newVatName.dispatchEvent(new Event('input'));
      expect(buttons.launchVat?.element.disabled).toBe(true);

      newVatName.value = 'Bob';
      newVatName.dispatchEvent(new Event('input'));
      expect(buttons.launchVat?.element.disabled).toBe(true);

      newVatName.value = 'Alice';
      bundleUrl.value = 'http://localhost:3000/sample-vat.bundle';
      newVatName.dispatchEvent(new Event('input'));
      expect(buttons.launchVat?.element.disabled).toBe(false);
    });

    it('should update button states on vat selection change', async () => {
      const { setupVatListeners } = await import('./status');
      const { buttons, vatDropdown } = await import('./buttons');

      setupVatListeners();

      // No selection
      vatDropdown.value = '';
      vatDropdown.dispatchEvent(new Event('change'));
      expect(buttons.restartVat?.element.disabled).toBe(true);
      expect(buttons.terminateVat?.element.disabled).toBe(true);

      // With selection
      vatDropdown.value = 'v0';
      vatDropdown.dispatchEvent(new Event('change'));
      expect(buttons.restartVat?.element.disabled).toBe(false);
      expect(buttons.terminateVat?.element.disabled).toBe(false);
    });
  });

  describe('updateButtonStates', () => {
    it('should disable launch button when new vat ID is empty', async () => {
      const { updateButtonStates } = await import('./status');
      const { buttons, newVatName, bundleUrl } = await import('./buttons');
      newVatName.value = '';
      bundleUrl.value = '';
      updateButtonStates(true);
      expect(buttons.launchVat?.element.disabled).toBe(true);
    });

    it('should not enable launch button when new vat ID is non-empty', async () => {
      const { updateButtonStates } = await import('./status');
      const { buttons, newVatName, bundleUrl } = await import('./buttons');
      newVatName.value = 'test-vat';
      bundleUrl.value = '';
      updateButtonStates(true);
      expect(buttons.launchVat?.element.disabled).toBe(true);
    });

    it('should not enable launch button when bundle URL is invalid', async () => {
      const { updateButtonStates } = await import('./status');
      const { buttons, newVatName, bundleUrl } = await import('./buttons');
      newVatName.value = 'test-vat';
      bundleUrl.value = 'not-a-url';
      updateButtonStates(true);
      expect(buttons.launchVat?.element.disabled).toBe(true);
    });

    it('should enable launch button when new vat ID and bundle URL is valid', async () => {
      const { updateButtonStates } = await import('./status');
      const { buttons, newVatName, bundleUrl } = await import('./buttons');
      newVatName.value = 'test-vat';
      bundleUrl.value = 'http://example.com/test.bundle';
      updateButtonStates(true);
      expect(buttons.launchVat?.element.disabled).toBe(false);
    });

    it('should disable restart and terminate buttons based on vat selection', async () => {
      const { updateButtonStates } = await import('./status');
      const { buttons, vatDropdown } = await import('./buttons');

      vatDropdown.value = '';
      updateButtonStates(true);
      expect(buttons.restartVat?.element.disabled).toBe(true);
      expect(buttons.terminateVat?.element.disabled).toBe(true);
    });

    it('should enable restart and terminate buttons based on vat selection', async () => {
      const { updateButtonStates } = await import('./status');
      const { buttons, vatDropdown } = await import('./buttons');

      const option = document.createElement('option');
      option.value = 'v1';
      option.text = 'v1';
      vatDropdown.add(option);

      vatDropdown.value = 'v1';
      updateButtonStates(true);
      expect(buttons.restartVat?.element.disabled).toBe(false);
      expect(buttons.terminateVat?.element.disabled).toBe(false);
    });

    it('should disable terminate all button when no vats exist', async () => {
      const { updateButtonStates } = await import('./status');
      const { buttons } = await import('./buttons');
      updateButtonStates(false);
      expect(buttons.terminateAllVats?.element.disabled).toBe(true);
    });

    it('should enable terminate all button when vats exist', async () => {
      const { updateButtonStates } = await import('./status');
      const { buttons } = await import('./buttons');
      updateButtonStates(true);
      expect(buttons.terminateAllVats?.element.disabled).toBe(false);
    });

    it('should handle missing buttons', async () => {
      const { updateButtonStates } = await import('./status');
      const { buttons } = await import('./buttons');

      // @ts-expect-error - testing undefined state
      buttons.launchVat = undefined;
      // @ts-expect-error - testing undefined state
      buttons.restartVat = undefined;
      // @ts-expect-error - testing undefined state
      buttons.terminateVat = undefined;
      // @ts-expect-error - testing undefined state
      buttons.terminateAllVats = undefined;

      expect(() => updateButtonStates(true)).not.toThrow();
    });

    it('should disable launch button when bundle URL is invalid', async () => {
      const { updateButtonStates } = await import('./status');
      const { buttons, newVatName, bundleUrl } = await import('./buttons');

      newVatName.value = 'test-vat';
      bundleUrl.value = 'not-a-url';
      updateButtonStates(true);
      expect(buttons.launchVat?.element.disabled).toBe(true);

      bundleUrl.value = 'http://example.com/not-bundle';
      updateButtonStates(true);
      expect(buttons.launchVat?.element.disabled).toBe(true);
    });

    it('should enable launch button when bundle URL is valid', async () => {
      const { updateButtonStates } = await import('./status');
      const { buttons, newVatName, bundleUrl } = await import('./buttons');

      newVatName.value = 'test-vat';
      bundleUrl.value = 'http://example.com/test.bundle';
      updateButtonStates(true);
      expect(buttons.launchVat?.element.disabled).toBe(false);
    });
  });
});
