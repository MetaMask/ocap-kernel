import type { VatId } from '@ocap/kernel';
import { stringify } from '@ocap/utils';

import { buttons, vatDropdown, newVatName } from './buttons.js';
import { logger } from './shared.js';
import type { KernelControlCommand, KernelStatus } from '../kernel/messages.js';

export const statusDisplay = document.getElementById(
  'status-display',
) as HTMLElement;

/**
 * Setup status polling.
 *
 * @param sendMessage - A function for sending messages.
 */
export async function setupStatusPolling(
  sendMessage: (message: KernelControlCommand) => Promise<void>,
): Promise<void> {
  const fetchStatus = async (): Promise<void> => {
    await sendMessage({
      method: 'getStatus',
      params: null,
    });

    setTimeout(() => {
      fetchStatus().catch(logger.error);
    }, 1000);
  };

  await fetchStatus();
}

/**
 * Update the status display with the current status.
 *
 * @param status - The current status.
 */
export function updateStatusDisplay(status: KernelStatus): void {
  const { isRunning, activeVats } = status;
  statusDisplay.textContent = isRunning
    ? `Active Vats (${activeVats.length}): ${stringify(activeVats, 0)}`
    : 'Kernel is not running';

  updatevatDropdown(activeVats);
}

/**
 * Setup listeners for vat ID input and change events.
 */
export function setupVatListeners(): void {
  newVatName.addEventListener('input', () => {
    updateButtonStates(vatDropdown.options.length > 1);
  });

  vatDropdown.addEventListener('change', () => {
    updateButtonStates(vatDropdown.options.length > 1);
  });
}

/**
 * Updates the vat selection dropdown with active vats
 *
 * @param activeVats - Array of active vat IDs
 */
function updatevatDropdown(activeVats: VatId[]): void {
  // Compare current options with new vats
  const currentVats = Array.from(vatDropdown.options)
    .slice(1) // Skip the default empty option
    .map((option) => option.value as VatId);

  // Skip update if vats haven't changed
  if (JSON.stringify(currentVats) === JSON.stringify(activeVats)) {
    return;
  }

  // Store current selection
  const currentSelection = vatDropdown.value;

  // Clear existing options except the default one
  while (vatDropdown.options.length > 1) {
    vatDropdown.remove(1);
  }

  // Add new options
  activeVats.forEach((id) => {
    const option = document.createElement('option');
    option.value = id;
    option.text = id;
    vatDropdown.add(option);
  });

  // Restore selection if it still exists
  if (activeVats.includes(currentSelection as VatId)) {
    vatDropdown.value = currentSelection;
  } else {
    vatDropdown.value = '';
  }

  // Update button states
  updateButtonStates(activeVats.length > 0);
}

/**
 * Updates button states based on selections and vat existence
 *
 * @param hasVats - Whether any vats exist
 */
export function updateButtonStates(hasVats: boolean): void {
  // Launch button - enabled only when new vat ID is not empty
  if (buttons.launchVat) {
    buttons.launchVat.element.disabled = !newVatName.value.trim();
  }

  // Restart and terminate buttons - enabled when a vat is selected
  if (buttons.restartVat) {
    buttons.restartVat.element.disabled = !vatDropdown.value;
  }
  if (buttons.terminateVat) {
    buttons.terminateVat.element.disabled = !vatDropdown.value;
  }

  // Terminate all - enabled only when vats exist
  if (buttons.terminateAllVats) {
    buttons.terminateAllVats.element.disabled = !hasVats;
  }
}
