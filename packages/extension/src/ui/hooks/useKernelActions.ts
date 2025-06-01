import type { ClusterConfig } from '@metamask/ocap-kernel';
import { useCallback } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';

/**
 * Hook for handling kernel actions.
 *
 * @returns Kernel actions.
 */
export function useKernelActions(): {
  terminateAllVats: () => void;
  collectGarbage: () => void;
  clearState: () => void;
  reload: () => void;
  launchVat: (
    bundleUrl: string,
    vatName: string,
    subclusterId?: string,
  ) => void;
  launchSubcluster: (config: ClusterConfig) => void;
} {
  const { callKernelMethod, logMessage } = usePanelContext();

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
   * Reloads the kernel
   */
  const reload = useCallback(() => {
    callKernelMethod({
      method: 'reload',
      params: [],
    })
      .then(() => logMessage('Kernel reloaded', 'success'))
      .catch(() => logMessage('Failed to reload', 'error'));
  }, [callKernelMethod, logMessage]);

  /**
   * Launches a vat.
   */
  const launchVat = useCallback(
    (bundleUrl: string, vatName: string, subclusterId?: string) => {
      callKernelMethod({
        method: 'launchVat',
        params: {
          config: {
            bundleSpec: bundleUrl,
            parameters: {
              name: vatName,
            },
          },
          ...(subclusterId && { subclusterId }),
        },
      })
        .then(() => logMessage(`Launched vat "${vatName}"`, 'success'))
        .catch(() => logMessage(`Failed to launch vat "${vatName}":`, 'error'));
    },
    [callKernelMethod, logMessage],
  );

  /**
   * Launches a subcluster.
   */
  const launchSubcluster = useCallback(
    (config: ClusterConfig) => {
      callKernelMethod({
        method: 'launchSubcluster',
        params: { config },
      })
        .then(() => logMessage('Subcluster launched', 'success'))
        .catch((error) =>
          logMessage(`Failed to launch subcluster: ${error.message}`, 'error'),
        );
    },
    [callKernelMethod, logMessage],
  );

  return {
    terminateAllVats,
    collectGarbage,
    clearState,
    reload,
    launchVat,
    launchSubcluster,
  };
}
