import { VatCommandMethod } from '@ocap/kernel';
import type { VatId } from '@ocap/kernel';
import { stringify } from '@ocap/utils';
import { useCallback, useMemo } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';
import type { VatRecord } from '../types.ts';

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
  const { sendMessage, status, logMessage } = usePanelContext();

  const vats = useMemo(() => {
    return (
      status?.vats.map(({ id, config }) => ({
        id,
        source:
          config?.bundleSpec ??
          config?.sourceSpec ??
          config?.bundleName ??
          'unknown',
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
      sendMessage({
        method: 'sendVatCommand',
        params: {
          id,
          payload: {
            method: VatCommandMethod.ping,
            params: null,
          },
        },
      })
        .then((result) => logMessage(stringify(result, 0), 'received'))
        .catch((error) => logMessage(error.message, 'error'));
    },
    [sendMessage, logMessage],
  );

  /**
   * Restarts a vat.
   */
  const restartVat = useCallback(
    (id: VatId) => {
      sendMessage({
        method: 'restartVat',
        params: { id },
      })
        .then(() => logMessage(`Restarted vat "${id}"`, 'success'))
        .catch(() => logMessage(`Failed to restart vat "${id}"`, 'error'));
    },
    [sendMessage, logMessage],
  );

  /**
   * Terminates a vat.
   */
  const terminateVat = useCallback(
    (id: VatId) => {
      sendMessage({
        method: 'terminateVat',
        params: { id },
      })
        .then(() => logMessage(`Terminated vat "${id}"`, 'success'))
        .catch(() => logMessage(`Failed to terminate vat "${id}"`, 'error'));
    },
    [sendMessage, logMessage],
  );

  return {
    vats,
    pingVat,
    restartVat,
    terminateVat,
  };
};
