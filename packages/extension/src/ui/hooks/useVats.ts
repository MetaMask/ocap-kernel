import { VatCommandMethod } from '@ocap/kernel';
import type { VatId } from '@ocap/kernel';
import { stringify } from '@ocap/utils';
import { useCallback, useMemo } from 'react';

import { KernelControlMethod } from '../../kernel-integration/messages.js';
import { usePanelContext } from '../context/PanelContext.js';
import type { VatRecord } from '../types.js';

/**
 * Hook to manage the vats state.
 *
 * @returns An object containing the vats, selected vat id, and functions to update them.
 */
export const useVats = (): {
  vats: VatRecord[];
  selectedVatId: VatId | undefined;
  setSelectedVatId: (id: VatId | undefined) => void;
  pingVat: (id: VatId) => void;
  restartVat: (id: VatId) => void;
  terminateVat: (id: VatId) => void;
  resetVat: (id: VatId) => void;
} => {
  const { sendMessage, status, selectedVatId, setSelectedVatId, logMessage } =
    usePanelContext();

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
        method: KernelControlMethod.sendVatCommand,
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
        method: KernelControlMethod.restartVat,
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
        method: KernelControlMethod.terminateVat,
        params: { id },
      })
        .then(() => logMessage(`Terminated vat "${id}"`, 'success'))
        .catch(() => logMessage(`Failed to terminate vat "${id}"`, 'error'));
    },
    [sendMessage, logMessage],
  );

  /**
   * Resets the storage for a vat.
   */
  const resetVat = useCallback(
    (id: VatId) => {
      sendMessage({
        method: KernelControlMethod.resetVat,
        params: { id },
      })
        .then(() => logMessage(`Reset vat "${id}"`, 'success'))
        .catch(() => logMessage(`Failed to reset vat "${id}"`, 'error'));
    },
    [sendMessage, logMessage],
  );

  return {
    vats,
    selectedVatId,
    setSelectedVatId,
    pingVat,
    restartVat,
    terminateVat,
    resetVat,
  };
};
