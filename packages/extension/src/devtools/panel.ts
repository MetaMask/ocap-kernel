import type { Json } from '@metamask/utils';
import type { VatId } from '@ocap/kernel';
import { ChromeRuntimeDuplexStream, ChromeRuntimeTarget } from '@ocap/streams';

import type { KernelStatus } from '../kernel/messages.js';

// Initialize and start the UI
main().catch(console.error);

/**
 * The main function for the devtools panel.
 */
async function main(): Promise<void> {
  const stream = await ChromeRuntimeDuplexStream.make(
    chrome.runtime,
    ChromeRuntimeTarget.Devtools,
    ChromeRuntimeTarget.Offscreen,
  );

  const sendMessage = async (message: Json): Promise<void> => {
    await stream.write(message);
  };

  const getVatId = (): VatId =>
    (document.getElementById('vat-id') as HTMLInputElement).value as VatId;

  document.getElementById('init-kernel')?.addEventListener('click', () => {
    sendMessage({
      method: 'initKernel',
    }).catch(console.error);
  });

  document.getElementById('shutdown-kernel')?.addEventListener('click', () => {
    sendMessage({
      method: 'shutdownKernel',
    }).catch(console.error);
  });

  document.getElementById('launch-vat')?.addEventListener('click', () => {
    sendMessage({
      method: 'launchVat',
      params: { id: getVatId() },
    }).catch(console.error);
  });

  document.getElementById('restart-vat')?.addEventListener('click', () => {
    sendMessage({
      method: 'restartVat',
      params: { id: getVatId() },
    }).catch(console.error);
  });

  document.getElementById('terminate-vat')?.addEventListener('click', () => {
    sendMessage({
      method: 'terminateVat',
      params: { id: getVatId() },
    }).catch(console.error);
  });

  document.getElementById('terminate-all')?.addEventListener('click', () => {
    sendMessage({
      method: 'terminateAllVats',
    }).catch(console.error);
  });

  /**
   * Update the status display.
   */
  const updateStatus = async (): Promise<void> => {
    const statusDisplay = document.getElementById('status-display');
    if (!statusDisplay) {
      return;
    }

    const { status } = (await stream.write({
      method: 'getStatus',
    })) as unknown as { status: KernelStatus };

    // Write the status to the display
    statusDisplay.textContent = JSON.stringify(status, null, 2);

    // Update every second
    setTimeout(() => {
      updateStatus().catch(console.error);
    }, 1000);
  };

  await updateStatus();
}
