import type { ClusterConfig } from '@ocap/kernel';
import { stringify } from '@ocap/utils';
import { useCallback } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';
/**
 * Hook for handling kernel actions.
 *
 * @returns Kernel actions.
 */
export function useKernelActions(): {
  sendKernelCommand: () => void;
  terminateAllVats: () => void;
  clearState: () => void;
  reload: () => void;
  launchVat: (bundleUrl: string, vatName: string) => void;
  updateClusterConfig: (config: ClusterConfig) => Promise<void>;
} {
  const { sendMessage, logMessage, messageContent, selectedVatId } =
    usePanelContext();

  /**
   * Sends a kernel command.
   */
  const sendKernelCommand = useCallback(() => {
    sendMessage({
      method: 'sendVatCommand',
      params: {
        payload: JSON.parse(messageContent),
        ...(selectedVatId ? { id: selectedVatId } : {}),
      },
    })
      .then((result) => logMessage(stringify(result, 0), 'received'))
      .catch((error) => logMessage(error.message, 'error'));
  }, [messageContent, selectedVatId, sendMessage, logMessage]);

  /**
   * Terminates all vats.
   */
  const terminateAllVats = useCallback(() => {
    sendMessage({
      method: 'terminateAllVats',
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
      method: 'clearState',
      params: null,
    })
      .then(() => logMessage('State cleared', 'success'))
      .catch(() => logMessage('Failed to clear state', 'error'));
  }, [sendMessage, logMessage]);

  /**
   * Reloads the kernel default sub-cluster.
   */
  const reload = useCallback(() => {
    sendMessage({
      method: 'reload',
      params: null,
    })
      .then(() => logMessage('Default sub-cluster reloaded', 'success'))
      .catch(() => logMessage('Failed to reload', 'error'));
  }, [sendMessage, logMessage]);

  /**
   * Launches a vat.
   */
  const launchVat = useCallback(
    (bundleUrl: string, vatName: string) => {
      sendMessage({
        method: 'launchVat',
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

  /**
   * Updates the cluster config.
   */
  const updateClusterConfig = useCallback(
    async (config: ClusterConfig) => {
      return sendMessage({
        method: 'updateClusterConfig',
        params: { config },
      })
        .then(() => logMessage('Config updated', 'success'))
        .catch(() => logMessage('Failed to update config', 'error'));
    },
    [sendMessage, logMessage],
  );

  return {
    sendKernelCommand,
    terminateAllVats,
    clearState,
    reload,
    launchVat,
    updateClusterConfig,
  };
}
