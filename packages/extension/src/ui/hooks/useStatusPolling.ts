import { stringify } from '@metamask/kernel-utils';
import { hasProperty } from '@metamask/utils';
import { useEffect, useRef, useState } from 'react';

import type { StreamState } from './useStream.ts';
import type { KernelStatus } from '../../kernel-integration/handlers/index.ts';
import { logger } from '../services/logger.ts';

/**
 * Hook to start polling for kernel status
 *
 * @param callKernelMethod - Function to send a message to the kernel
 * @param isRequestInProgress - Ref to track if a request is in progress
 * @param interval - Polling interval in milliseconds
 * @returns The kernel status
 */
export const useStatusPolling = (
  callKernelMethod: StreamState['callKernelMethod'],
  isRequestInProgress: React.RefObject<boolean>,
  interval: number = 1000,
): KernelStatus | undefined => {
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const [status, setStatus] = useState<KernelStatus>();

  /**
   * Effect to start polling for kernel status.
   */
  useEffect(() => {
    const fetchStatus = async (): Promise<void> => {
      if (!callKernelMethod || isRequestInProgress.current) {
        return;
      }
      try {
        const result = await callKernelMethod({
          method: 'getStatus',
          params: [],
        });
        if (hasProperty(result, 'error')) {
          throw new Error(stringify(result.error, 0));
        }
        setStatus(result);
      } catch (error) {
        logger.error('Failed to fetch status:', error);
      }
    };

    pollingRef.current = setInterval(() => {
      fetchStatus().catch(logger.error);
    }, interval);

    fetchStatus().catch(logger.error);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [callKernelMethod, interval, isRequestInProgress]);

  return status;
};
