import type { KRef } from '@metamask/ocap-kernel';
import { useCallback } from 'react';

import { useDatabase } from './useDatabase.ts';
import { usePanelContext } from '../context/PanelContext.tsx';
import { parseObjectRegistry } from '../services/db-parser.ts';

/**
 * Hook for registry actions.
 *
 * @returns Registry methods.
 */
export function useRegistry(): {
  fetchObjectRegistry: () => void;
  revoke: (kref: KRef) => void;
} {
  const { callKernelMethod, logMessage, setObjectRegistry } = usePanelContext();
  const { executeQuery } = useDatabase();

  // Revoke an object
  const revoke = useCallback(
    (kref: KRef) => {
      callKernelMethod({ method: 'revoke', params: { kref } })
        .then(() => logMessage(`Revoked object ${kref}`, 'success'))
        .catch((error) =>
          logMessage(
            `Failed to revoke object ${kref}: ${error.message}`,
            'error',
          ),
        );
    },
    [callKernelMethod, logMessage],
  );

  // Fetch the kv db and parse it into an object registry
  const fetchObjectRegistry = useCallback((): void => {
    executeQuery('SELECT key, value FROM kv')
      .then((result) => {
        const parsedData = parseObjectRegistry(
          result as { key: string; value: string }[],
        );
        return setObjectRegistry(parsedData);
      })
      .catch((error: Error) =>
        logMessage(
          `Failed to fetch object registry: ${error.message}`,
          'error',
        ),
      );
  }, [executeQuery, logMessage, setObjectRegistry]);

  return {
    fetchObjectRegistry,
    revoke,
  };
}
