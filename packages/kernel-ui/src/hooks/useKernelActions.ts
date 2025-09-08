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
      .catch((problem) =>
        logMessage(`Failed to collect garbage ${problem}`, 'error'),
      );
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
      .catch((error: Error) =>
        logMessage(`Failed to clear state: ${error.message}`, 'error'),
      );
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
    launchSubcluster,
  };
}
