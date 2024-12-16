import type { VatId } from '@ocap/kernel';
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
  restartVat: (id: VatId) => void;
  terminateVat: (id: VatId) => void;
} => {
  const { sendMessage, status, selectedVatId, setSelectedVatId, logMessage } =
    usePanelContext();

  const vats = useMemo(() => {
    return (
      status?.activeVats.map((id) => ({
        id,
        name: id,
        source: 'unknown',
      })) ?? []
    );
  }, [status]);

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

  return {
    vats,
    selectedVatId,
    setSelectedVatId,
    restartVat,
    terminateVat,
  };
};
