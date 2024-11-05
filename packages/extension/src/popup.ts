import type { VatId } from '@ocap/kernel';
import { ChromeRuntimeDuplexStream, ChromeRuntimeTarget } from '@ocap/streams';
import { makeLogger } from '@ocap/utils';

import { isKernelStatus } from './kernel/messages.js';
import type {
  KernelControlCommand,
  KernelControlReply,
  KernelStatus,
} from './kernel/messages.js';

const logger = makeLogger('[Kernel Panel]');

// DOM Elements
const vatId = document.getElementById('vat-id') as HTMLInputElement;
const statusDisplay = document.getElementById('status-display') as HTMLElement;
const buttons: Record<
  string,
  {
    element: HTMLButtonElement;
    command: KernelControlCommand;
  }
> = {
  initKernel: {
    element: document.getElementById('init-kernel') as HTMLButtonElement,
    command: { method: 'initKernel', params: null },
  },
  shutdownKernel: {
    element: document.getElementById('shutdown-kernel') as HTMLButtonElement,
    command: { method: 'shutdownKernel', params: null },
  },
  launchVat: {
    element: document.getElementById('launch-vat') as HTMLButtonElement,
    command: { method: 'launchVat', params: { id: vatId.value as VatId } },
  },
  restartVat: {
    element: document.getElementById('restart-vat') as HTMLButtonElement,
    command: { method: 'restartVat', params: { id: vatId.value as VatId } },
  },
  terminateVat: {
    element: document.getElementById('terminate-vat') as HTMLButtonElement,
    command: { method: 'terminateVat', params: { id: vatId.value as VatId } },
  },
  terminateAllVats: {
    element: document.getElementById('terminate-all') as HTMLButtonElement,
    command: { method: 'terminateAllVats', params: null },
  },
};

// Initialize and start the UI
main().catch(logger.error);

/**
 * The main function for the popup script.
 */
async function main(): Promise<void> {
  chrome.runtime.connect({ name: 'popup' });

  const offscreenStream = await ChromeRuntimeDuplexStream.make<
    KernelControlReply,
    KernelControlCommand
  >(chrome.runtime, ChromeRuntimeTarget.Popup, ChromeRuntimeTarget.Offscreen);
  logger.log('devtools <-> offscreen stream created');

  const sendMessage = async (message: KernelControlCommand): Promise<void> => {
    logger.log('sending devtools message', message);
    await offscreenStream.write(message);
  };

  // Setup all button handlers
  Object.values(buttons).forEach((button) => {
    button.element.addEventListener('click', () => {
      sendMessage(button.command).catch(logger.error);
    });
  });

  // Update the status display
  const updateStatusDisplay = (status: KernelStatus): void => {
    const { isRunning, activeVats } = status;
    statusDisplay.textContent = isRunning
      ? `Active Vats: ${activeVats.join(', ')}`
      : 'Kernel is not running';

    if (buttons.shutdownKernel?.element) {
      buttons.shutdownKernel.element.style.display = isRunning
        ? 'block'
        : 'none';
    }
    if (buttons.initKernel?.element) {
      buttons.initKernel.element.style.display = isRunning ? 'none' : 'block';
    }
  };

  // Handle messages from the offscreen script
  const handleOffscreenMessage = (message: KernelControlReply): void => {
    if (isKernelStatus(message)) {
      updateStatusDisplay(message);
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
