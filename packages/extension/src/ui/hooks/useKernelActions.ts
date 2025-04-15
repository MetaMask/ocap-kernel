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
  collectGarbage: () => void;
  clearState: () => void;
  reload: () => void;
  launchVat: (bundleUrl: string, vatName: string) => void;
  updateClusterConfig: (config: ClusterConfig) => Promise<void>;
} {
  const { callKernelMethod, logMessage, messageContent } = usePanelContext();

  /**
   * Sends a kernel command.
   */
  const sendKernelCommand = useCallback(() => {
    callKernelMethod({
      method: 'sendVatCommand',
      params: JSON.parse(messageContent),
    })
      .then((result) => logMessage(stringify(result, 0), 'received'))
      .catch((error) => logMessage(error.message, 'error'));
  }, [messageContent, callKernelMethod, logMessage]);

  /**
   * Terminates all vats.
   */
  const terminateAllVats = useCallback(() => {
    callKernelMethod({
      method: 'terminateAllVats',
      params: [],
    })
      .then(() => logMessage('All vats terminated', 'success'))
      .catch(() => logMessage('Failed to terminate all vats', 'error'));
  }, [callKernelMethod, logMessage]);

  /**
   * Collects garbage.
   */
  const collectGarbage = useCallback(() => {
    callKernelMethod({
      method: 'collectGarbage',
      params: [],
    })
      .then(() => logMessage('Garbage collected', 'success'))
      .catch(() => logMessage('Failed to collect garbage', 'error'));
  }, [callKernelMethod, logMessage]);

  /**
   * Clears the kernel state.
   */
  const clearState = useCallback(() => {
    callKernelMethod({
      method: 'clearState',
      params: [],
    })
      .then(() => logMessage('State cleared', 'success'))
      .catch(() => logMessage('Failed to clear state', 'error'));
  }, [callKernelMethod, logMessage]);

  /**
   * Reloads the kernel default sub-cluster.
   */
  const reload = useCallback(() => {
    callKernelMethod({
      method: 'reload',
      params: [],
    })
      .then(() => logMessage('Default sub-cluster reloaded', 'success'))
      .catch(() => logMessage('Failed to reload', 'error'));
  }, [callKernelMethod, logMessage]);

  /**
   * Launches a vat.
   */
  const launchVat = useCallback(
    (bundleUrl: string, vatName: string) => {
      callKernelMethod({
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
    [callKernelMethod, logMessage],
  );

  /**
   * Updates the cluster config.
   */
  const updateClusterConfig = useCallback(
    async (config: ClusterConfig) => {
      return callKernelMethod({
        method: 'updateClusterConfig',
        params: { config },
      })
        .then(() => logMessage('Config updated', 'success'))
        .catch(() => logMessage('Failed to update config', 'error'));
    },
    [callKernelMethod, logMessage],
  );

  return {
    sendKernelCommand,
    terminateAllVats,
    collectGarbage,
    clearState,
    reload,
    launchVat,
    updateClusterConfig,
  };
}
