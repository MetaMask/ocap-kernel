import { useEffect, useRef, useState } from 'react';

import type { StreamState } from './useStream.ts';
import type { KernelStatus } from '../../kernel-integration/messages.ts';
import { logger } from '../services/logger.ts';
import { isErrorResponse } from '../utils.ts';

/**
 * Hook to start polling for kernel status
 *
 * @param sendMessage - Function to send a message to the kernel
 * @param interval - Polling interval in milliseconds
 *
 * @returns The kernel status
 */
export const useStatusPolling = (
  sendMessage: StreamState['sendMessage'],
  interval: number = 1000,
): KernelStatus | undefined => {
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const [status, setStatus] = useState<KernelStatus>();

  /**
   * Effect to start polling for kernel status.
   */
  useEffect(() => {
    const fetchStatus = async (): Promise<void> => {
      if (!sendMessage) {
        return;
      }
      try {
        const result = await sendMessage({
          method: 'getStatus',
          params: null,
        });
        if (isErrorResponse(result)) {
          throw new Error(result.error);
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
  }, [sendMessage, interval]);

  return status;
};
