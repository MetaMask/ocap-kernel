import type { VatId } from '@ocap/kernel';
import { useState, useCallback, useMemo } from 'react';

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
  const { sendMessage, status } = usePanelContext();
  const [selectedVatId, setSelectedVatId] = useState<VatId | undefined>();

  const vats = useMemo(() => {
    return (
      status?.activeVats.map((id) => {
        return {
          id,
          name: id,
          source: 'unknown§',
        };
      }) ?? []
    );
  }, [status]);

  const restartVat = useCallback(
    (id: VatId) => {
      sendMessage({ method: 'restartVat', params: { id } }).catch((error) => {
        console.error(`Failed to restart vat "${id}":`, error);
      });
    },
    [sendMessage],
  );

  const terminateVat = useCallback(
    (id: VatId) => {
      sendMessage({ method: 'terminateVat', params: { id } }).catch((error) => {
        console.error(`Failed to terminate vat "${id}":`, error);
      });
    },
    [sendMessage],
  );

  return {
    vats,
    selectedVatId,
    setSelectedVatId,
    restartVat,
    terminateVat,
  };
};
