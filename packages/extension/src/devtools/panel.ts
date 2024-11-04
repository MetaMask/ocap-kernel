import type { VatId } from '@ocap/kernel';
import { ChromeRuntimeDuplexStream, ChromeRuntimeTarget } from '@ocap/streams';

import type { KernelControlCommand } from '../kernel/messages.js';

// This will redirect logs to both the panel's console and the DevTools-for-DevTools console
const originalConsole = { ...console };
Object.assign(console, {
  log: (...args: unknown[]) => {
    originalConsole.log('[Devtools Panel]', ...args);
    // Also log to the DevTools-for-DevTools console
    chrome.devtools.inspectedWindow.eval(
      `console.log("[Devtools Panel]", ${JSON.stringify(args)})`,
    );
  },
  error: (...args: unknown[]) => {
    originalConsole.error('[Devtools Panel]', ...args);
    chrome.devtools.inspectedWindow.eval(
      `console.error("[Devtools Panel]", ${JSON.stringify(args)})`,
    );
  },
});

// Initialize and start the UI
main().catch(console.error);

/**
 * The main function for the devtools panel.
 */
async function main(): Promise<void> {
  const offscreenStream = await ChromeRuntimeDuplexStream.make(
    chrome.runtime,
    ChromeRuntimeTarget.Devtools,
    ChromeRuntimeTarget.Offscreen,
  );
  console.log('devtools <-> offscreen stream created');

  const sendMessage = async (message: KernelControlCommand): Promise<void> => {
    console.log('sending devtools message', message);
    await offscreenStream.write(message);
  };

  const getVatId = (): VatId =>
    (document.getElementById('vat-id') as HTMLInputElement).value as VatId;

  document.getElementById('init-kernel')?.addEventListener('click', () => {
    sendMessage({
      method: 'initKernel',
      params: null,
    }).catch(console.error);
  });

  document.getElementById('shutdown-kernel')?.addEventListener('click', () => {
    sendMessage({
      method: 'shutdownKernel',
      params: null,
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
      params: null,
    }).catch(console.error);
  });

  /**
   * Update the status display.
   */
  // const updateStatus = async (): Promise<void> => {
  //   const statusDisplay = document.getElementById('status-display');
  //   if (!statusDisplay) {
  //     return;
  //   }

  //   await stream.write({ method: 'getStatus' });

  //   // Write the status to the display
  //   statusDisplay.textContent = JSON.stringify(status, null, 2);

  //   // Update every second
  //   setTimeout(() => {
  //     updateStatus().catch(console.error);
  //   }, 1000);
  // };

  // await updateStatus();

  for await (const message of offscreenStream) {
    console.log('received devtools message', message);
  }
}
