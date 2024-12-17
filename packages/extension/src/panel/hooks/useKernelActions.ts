import { useCallback } from 'react';

import { KernelControlMethod } from '../../kernel-integration/messages.js';
import { usePanelContext } from '../context/PanelContext.js';

/**
 * Hook for handling kernel actions.
 *
 * @returns Kernel actions.
 */
export function useKernelActions(): {
  sendKernelCommand: () => void;
  terminateAllVats: () => void;
  clearState: () => void;
  launchVat: (bundleUrl: string, vatName: string) => void;
} {
  const { sendMessage, logMessage, messageContent, selectedVatId } =
    usePanelContext();

  /**
   * Sends a kernel command.
   */
  const sendKernelCommand = useCallback(() => {
    sendMessage({
      method: KernelControlMethod.sendMessage,
      params: {
        payload: JSON.parse(messageContent),
        ...(selectedVatId ? { id: selectedVatId } : {}),
      },
    })
      .then((result) => logMessage(JSON.stringify(result, null, 2), 'success'))
      .catch(() => logMessage('Failed to send message', 'error'));
  }, [messageContent, selectedVatId, sendMessage, logMessage]);

  /**
   * Terminates all vats.
   */
  const terminateAllVats = useCallback(() => {
    sendMessage({
      method: KernelControlMethod.terminateAllVats,
      params: null,
    })
      .then(() => logMessage('All vats terminated', 'success'))
      .catch(() => logMessage('Failed to terminate all vats', 'error'));
  }, [sendMessage, logMessage]);

  /**
   * Clears the kernel state.
   */
  const clearState = useCallback(() => {
    sendMessage({
      method: KernelControlMethod.clearState,
      params: null,
    })
      .then(() => logMessage('State cleared', 'success'))
      .catch(() => logMessage('Failed to clear state', 'error'));
  }, [sendMessage, logMessage]);

  /**
   * Launches a vat.
   */
  const launchVat = useCallback(
    (bundleUrl: string, vatName: string) => {
      sendMessage({
        method: KernelControlMethod.launchVat,
        params: {
          bundleSpec: bundleUrl,
          parameters: {
            name: vatName,
          },
        },
      })
        .then(() => logMessage(`Launched vat "${vatName}"`, 'success'))
        .catch(() => logMessage(`Failed to launch vat "${vatName}":`, 'error'));
    },
    [sendMessage, logMessage],
  );

  return {
    sendKernelCommand,
    terminateAllVats,
    clearState,
    launchVat,
  };
}
