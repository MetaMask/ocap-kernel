import type { VatId } from '@ocap/kernel';

import { ChromeKernelManager } from './ChromeKernelManager.js';

const kernelManager = new ChromeKernelManager();

const getVatId = (): VatId =>
  ((document.getElementById('vat-id') as HTMLInputElement).value ||
    'v0') as VatId;

const attachEventListeners = (): void => {
  document.getElementById('init-kernel')?.addEventListener('click', () => {
    kernelManager.initKernel().catch(console.error);
  });

  document.getElementById('shutdown-kernel')?.addEventListener('click', () => {
    kernelManager.shutdownKernel().catch(console.error);
  });

  document.getElementById('launch-vat')?.addEventListener('click', () => {
    kernelManager.launchVat(getVatId()).catch(console.error);
  });

  document.getElementById('restart-vat')?.addEventListener('click', () => {
    kernelManager.restartVat(getVatId()).catch(console.error);
  });

  document.getElementById('terminate-vat')?.addEventListener('click', () => {
    kernelManager.terminateVat(getVatId()).catch(console.error);
  });

  document.getElementById('terminate-all')?.addEventListener('click', () => {
    kernelManager.terminateAllVats().catch(console.error);
  });
};

const updateStatus = async (): Promise<void> => {
  const statusDisplay = document.getElementById('status-display');
  if (!statusDisplay) {
    return;
  }

  const status = await kernelManager.getKernelStatus();
  statusDisplay.textContent = JSON.stringify(status, null, 2);

  // Update every second
  setTimeout(() => {
    updateStatus().catch(console.error);
  }, 1000);
};

// Initialize panel when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  attachEventListeners();
  updateStatus().catch(console.error);
});
