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
} {
  const { sendMessage, logMessage, messageContent, selectedVatId } =
    usePanelContext();

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

  const terminateAllVats = useCallback(() => {
    sendMessage({
      method: KernelControlMethod.terminateAllVats,
      params: null,
    })
      .then(() => logMessage('All vats terminated', 'success'))
      .catch(() => logMessage('Failed to terminate all vats', 'error'));
  }, [sendMessage, logMessage]);

  const clearState = useCallback(() => {
    sendMessage({
      method: KernelControlMethod.clearState,
      params: null,
    })
      .then(() => logMessage('State cleared', 'success'))
      .catch(() => logMessage('Failed to clear state', 'error'));
  }, [sendMessage, logMessage]);

  return {
    sendKernelCommand,
    terminateAllVats,
    clearState,
  };
}
