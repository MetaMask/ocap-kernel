import { stringify } from '@metamask/kernel-utils';
import type {
  VatConfig,
  VatId,
  Subcluster,
  KernelStatus,
} from '@metamask/ocap-kernel';
import { useCallback, useMemo, useState } from 'react';

import { usePanelContext } from '../context/PanelContext.tsx';
import type { VatRecord } from '../types.ts';

export type Subclusters = (Subcluster & { vatRecords: VatRecord[] })[];

const getSourceFromConfig = (config: VatConfig): string => {
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

const transformVatData = (
  vatData: KernelStatus['vats'][number],
): VatRecord => ({
  id: vatData.id,
  source: getSourceFromConfig(vatData.config),
  parameters: stringify(vatData.config?.parameters ?? {}, 0),
  creationOptions: stringify(vatData.config?.creationOptions ?? {}, 0),
  subclusterId: vatData.subclusterId,
});

/**
 * Hook to manage the vats state, grouped by subcluster.
 *
 * @returns An object containing the grouped vats and functions to interact with them.
 */
export const useVats = (): {
  subclusters: Subclusters;
  pingVat: (id: VatId) => void;
  restartVat: (id: VatId) => void;
  terminateVat: (id: VatId) => void;
  terminateSubcluster: (id: string) => void;
  reloadSubcluster: (id: string) => void;
  hasVats: boolean;
} => {
  const { callKernelMethod, status, logMessage } = usePanelContext();
  const [hasVats, setHasVats] = useState(false);

  const subclusters = useMemo<Subclusters>(() => {
    if (!status) {
      return [];
    }

    setHasVats(status.vats.length > 0);

    // Create a map of vat records for quick lookup
    const vatRecords = new Map<VatId, VatRecord>();
    const subclusterVats = new Map<string, VatRecord[]>();

    // First pass: transform all vats and group them by subcluster
    for (const vat of status.vats) {
      const vatRecord = transformVatData(vat);
      vatRecords.set(vat.id, vatRecord);

      if (vat.subclusterId) {
        const vats = subclusterVats.get(vat.subclusterId) ?? [];
        vats.push(vatRecord);
        subclusterVats.set(vat.subclusterId, vats);
      }
    }

    // Second pass: create subclusters with their vat records
    const subclustersWithVats = status.subclusters.map((subcluster) => ({
      ...subcluster,
      vatRecords: subclusterVats.get(subcluster.id) ?? [],
    }));

    return subclustersWithVats;
  }, [status]);

  const pingVat = useCallback(
    (id: VatId) => {
      callKernelMethod({
        method: 'pingVat',
        params: { id },
      })
        .then((result) => logMessage(stringify(result), 'success'))
        .catch((error) => logMessage(error.message, 'error'));
    },
    [callKernelMethod, logMessage],
  );

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

  const terminateSubcluster = useCallback(
    (id: string) => {
      callKernelMethod({
        method: 'terminateSubcluster',
        params: { id },
      })
        .then(() => logMessage(`Terminated subcluster "${id}"`, 'success'))
        .catch(() =>
          logMessage(`Failed to terminate subcluster "${id}"`, 'error'),
        );
    },
    [callKernelMethod, logMessage],
  );

  const reloadSubcluster = useCallback(
    (id: string) => {
      callKernelMethod({
        method: 'reloadSubcluster',
        params: { id },
      })
        .then(() => logMessage(`Reloaded subcluster "${id}"`, 'success'))
        .catch(() =>
          logMessage(`Failed to reload subcluster "${id}"`, 'error'),
        );
    },
    [callKernelMethod, logMessage],
  );

  return {
    hasVats,
    subclusters,
    pingVat,
    restartVat,
    terminateVat,
    terminateSubcluster,
    reloadSubcluster,
  };
};
