import type { VatId } from '@ocap/kernel';

import { logger } from './shared.js';
import type { KernelControlCommand } from '../kernel/messages.js';

export const vatDropdown = document.getElementById(
  'vat-dropdown',
) as HTMLSelectElement;
export const newVatId = document.getElementById(
  'new-vat-id',
) as HTMLInputElement;

export const buttons: Record<
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
      params: { id: vatDropdown.value as VatId },
    }),
  },
  terminateVat: {
    element: document.getElementById('terminate-vat') as HTMLButtonElement,
    command: () => ({
      method: 'terminateVat',
      params: { id: vatDropdown.value as VatId },
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

/**
 * Setup button handlers for the kernel panel.
 *
 * @param sendMessage - The function to send messages to the kernel.
 */
export function setupButtonHandlers(
  sendMessage: (message: KernelControlCommand) => Promise<void>,
): void {
  Object.values(buttons).forEach((button) => {
    button.element.addEventListener('click', () => {
      sendMessage(button.command()).catch(logger.error);
    });
  });
}
