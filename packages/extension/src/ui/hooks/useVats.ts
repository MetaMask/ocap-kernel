import { VatCommandMethod } from '@ocap/kernel';
import type { VatConfig, VatId } from '@ocap/kernel';
import { stringify } from '@ocap/utils';
import { useCallback, useMemo } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';
import type { VatRecord } from '../types.ts';
import { nextMessageId } from '../utils.ts';

/**
 * Hook to manage the vats state.
 *
 * @returns An object containing the vats, selected vat id, and functions to update them.
 */
export const useVats = (): {
  vats: VatRecord[];
  pingVat: (id: VatId) => void;
  restartVat: (id: VatId) => void;
  terminateVat: (id: VatId) => void;
} => {
  const { callKernelMethod, status, logMessage } = usePanelContext();

  const getSource = (config: VatConfig): string => {
    if ('bundleSpec' in config) {
      return config.bundleSpec;
    }
    if ('sourceSpec' in config) {
      return config.sourceSpec;
    }
    if ('bundleName' in config) {
      return config.bundleName;
    }
    return 'unknown';
  };

  const vats = useMemo(() => {
    return (
      status?.vats.map(({ id, config }) => ({
        id,
        source: getSource(config),
        parameters: stringify(config?.parameters ?? {}, 0),
        creationOptions: stringify(config?.creationOptions ?? {}, 0),
      })) ?? []
    );
  }, [status]);

  /**
   * Pings a vat.
   */
  const pingVat = useCallback(
    (id: VatId) => {
      callKernelMethod({
        method: 'sendVatCommand',
        params: {
          id,
          payload: {
            id: nextMessageId(),
            jsonrpc: '2.0',
            method: VatCommandMethod.ping,
            params: [],
          },
        },
      })
        .then((result) => logMessage(stringify(result, 0), 'received'))
        .catch((error) => logMessage(error.message, 'error'));
    },
    [callKernelMethod, logMessage],
  );

  /**
   * Restarts a vat.
   */
  const restartVat = useCallback(
    (id: VatId) => {
      callKernelMethod({
        method: 'restartVat',
        params: { id },
      })
        .then(() => logMessage(`Restarted vat "${id}"`, 'success'))
        .catch(() => logMessage(`Failed to restart vat "${id}"`, 'error'));
    },
    [callKernelMethod, logMessage],
  );

  /**
   * Terminates a vat.
   */
  const terminateVat = useCallback(
    (id: VatId) => {
      callKernelMethod({
        method: 'terminateVat',
        params: { id },
      })
        .then(() => logMessage(`Terminated vat "${id}"`, 'success'))
        .catch(() => logMessage(`Failed to terminate vat "${id}"`, 'error'));
    },
    [callKernelMethod, logMessage],
  );

  return {
    vats,
    pingVat,
    restartVat,
    terminateVat,
  };
};
