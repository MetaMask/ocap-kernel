import { hasProperty, isObject } from '@metamask/utils';
import type { ClusterConfig } from '@ocap/kernel';
import { stringify } from '@ocap/utils';
import { useCallback } from 'react';

import { assertVatCommandParams } from '../../kernel-integration/handlers/send-vat-command.ts';
import type { SendVatCommandParams } from '../../kernel-integration/handlers/send-vat-command.ts';
import { usePanelContext } from '../context/PanelContext.tsx';
import { nextMessageId } from '../utils.ts';

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
      params: parseCommandParams(messageContent),
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

/**
 * Parses sendVatCommand params to the expected format. Basically, turns the payload
 * into a JSON-RPC request.
 *
 * @param rawParams - The raw, stringified params to parse.
 * @returns The parsed params.
 */
function parseCommandParams(rawParams: string): SendVatCommandParams {
  const params = JSON.parse(rawParams);
  if (
    isObject(params) &&
    isObject(params.payload) &&
    hasProperty(params.payload, 'method')
  ) {
    const parsed = {
      ...params,
      payload: {
        ...params.payload,
        id: nextMessageId(),
        jsonrpc: '2.0',
      },
    };
    assertVatCommandParams(parsed);
    return parsed;
  }
  throw new Error('Invalid command params');
}
