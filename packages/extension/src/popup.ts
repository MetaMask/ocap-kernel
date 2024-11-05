import type { VatId } from '@ocap/kernel';
import { ChromeRuntimeDuplexStream, ChromeRuntimeTarget } from '@ocap/streams';
import { makeLogger, stringify } from '@ocap/utils';

import { isKernelControlReply, isKernelStatus } from './kernel/messages.js';
import type {
  KernelControlCommand,
  KernelControlReply,
  KernelStatus,
} from './kernel/messages.js';

const logger = makeLogger('[Kernel Panel]');

// DOM Elements
const vatId = document.getElementById('vat-id') as HTMLSelectElement;
const newVatId = document.getElementById('new-vat-id') as HTMLInputElement;
const statusDisplay = document.getElementById('status-display') as HTMLElement;
const buttons: Record<
  string,
  {
    element: HTMLButtonElement;
    command: () => KernelControlCommand;
  }
> = {
  launchVat: {
    element: document.getElementById('launch-vat') as HTMLButtonElement,
    command: () => ({
      method: 'launchVat',
      params: { id: newVatId.value as VatId },
    }),
  },
  restartVat: {
    element: document.getElementById('restart-vat') as HTMLButtonElement,
    command: () => ({
      method: 'restartVat',
      params: { id: vatId.value as VatId },
    }),
  },
  terminateVat: {
    element: document.getElementById('terminate-vat') as HTMLButtonElement,
    command: () => ({
      method: 'terminateVat',
      params: { id: vatId.value as VatId },
    }),
  },
  terminateAllVats: {
    element: document.getElementById('terminate-all') as HTMLButtonElement,
    command: () => ({
      method: 'terminateAllVats',
      params: null,
    }),
  },
};

// Initialize and start the UI
main().catch(logger.error);

/**
 * Updates the vat selection dropdown with active vats
 *
 * @param activeVats - Array of active vat IDs
 */
function updateVatSelect(activeVats: VatId[]): void {
  // Compare current options with new vats
  const currentVats = Array.from(vatId.options)
    .slice(1) // Skip the default empty option
    .map((option) => option.value as VatId);

  // Skip update if vats haven't changed
  if (JSON.stringify(currentVats) === JSON.stringify(activeVats)) {
    return;
  }

  // Store current selection
  const currentSelection = vatId.value;

  // Clear existing options except the default one
  while (vatId.options.length > 1) {
    vatId.remove(1);
  }

  // Add new options
  activeVats.forEach((id) => {
    const option = document.createElement('option');
    option.value = id;
    option.text = id;
    vatId.add(option);
  });

  // Restore selection if it still exists
  if (activeVats.includes(currentSelection as VatId)) {
    vatId.value = currentSelection;
  } else {
    vatId.value = '';
  }

  // Update button states
  updateButtonStates(activeVats.length > 0);
}

/**
 * Updates button states based on selections and vat existence
 *
 * @param hasVats - Whether any vats exist
 */
function updateButtonStates(hasVats: boolean): void {
  // Launch button - enabled only when new vat ID is not empty
  if (buttons.launchVat) {
    buttons.launchVat.element.disabled = !newVatId.value;
  }

  // Restart and terminate buttons - enabled when a vat is selected
  if (buttons.restartVat) {
    buttons.restartVat.element.disabled = !vatId.value;
  }
  if (buttons.terminateVat) {
    buttons.terminateVat.element.disabled = !vatId.value;
  }

  // Terminate all - enabled only when vats exist
  if (buttons.terminateAllVats) {
    buttons.terminateAllVats.element.disabled = !hasVats;
  }
}

/**
 * The main function for the popup script.
 */
async function main(): Promise<void> {
  chrome.runtime.connect({ name: 'popup' });

  const offscreenStream = await ChromeRuntimeDuplexStream.make<
    KernelControlReply,
    KernelControlCommand
  >(chrome.runtime, ChromeRuntimeTarget.Popup, ChromeRuntimeTarget.Offscreen);

  const sendMessage = async (message: KernelControlCommand): Promise<void> => {
    logger.log('sending message', message);
    await offscreenStream.write(message);
  };

  // Setup input change handlers
  newVatId.addEventListener('input', () => {
    updateButtonStates(vatId.options.length > 1);
  });

  vatId.addEventListener('change', () => {
    updateButtonStates(vatId.options.length > 1);
  });

  // Setup all button handlers
  Object.values(buttons).forEach((button) => {
    button.element.addEventListener('click', () => {
      sendMessage(button.command()).catch(logger.error);
    });
  });

  // Update the status display
  const updateStatusDisplay = (status: KernelStatus): void => {
    const { isRunning, activeVats } = status;
    statusDisplay.textContent = isRunning
      ? `Active Vats (${activeVats.length}): ${stringify(activeVats, 0)}`
      : 'Kernel is not running';

    updateVatSelect(activeVats);
  };

  // Handle messages from the offscreen script
  const handleOffscreenMessage = (message: KernelControlReply): void => {
    if (isKernelControlReply(message) && isKernelStatus(message.params)) {
      updateStatusDisplay(message.params);
    }
  };

  // Drain the offscreen stream
  offscreenStream.drain(handleOffscreenMessage).catch((error) => {
    logger.error('error draining offscreen stream', error);
  });

  // Fetch the status periodically
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
