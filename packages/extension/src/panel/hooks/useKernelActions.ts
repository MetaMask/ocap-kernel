import { useCallback } from 'react';

import { KernelControlMethod } from '../../kernel-integration/messages.js';
import { usePanelContext } from '../context/PanelContext.js';
import { logger } from '../services/logger.js';

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
  const { sendMessage, showOutput, messageContent } = usePanelContext();

  // Send a message to the kernel
  const sendKernelCommand = useCallback(() => {
    try {
      const message = JSON.parse(messageContent);
      sendMessage(message).catch(logger.error);
    } catch (error) {
      showOutput('Invalid JSON input', 'error');
      logger.error('Failed to parse message content:', error);
    }
  }, [messageContent, sendMessage, showOutput]);

  // Terminate all vats
  const terminateAllVats = useCallback(() => {
    sendMessage({
      method: KernelControlMethod.terminateAllVats,
      params: null,
    })
      .then(() => showOutput('All vats terminated', 'success'))
      .catch(logger.error);
  }, [sendMessage, showOutput]);

  // Clear the state of all vats
  const clearState = useCallback(() => {
    sendMessage({
      method: KernelControlMethod.clearState,
      params: null,
    })
      .then(() => showOutput('State cleared', 'success'))
      .catch(logger.error);
  }, [sendMessage, showOutput]);

  return {
    sendKernelCommand,
    terminateAllVats,
    clearState,
  };
}
