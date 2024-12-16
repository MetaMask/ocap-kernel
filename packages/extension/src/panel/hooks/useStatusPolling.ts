import { useEffect, useRef } from 'react';

import type { StreamState } from './useStream.js';
import { KernelControlMethod } from '../../kernel-integration/messages.js';
import type { KernelStatus } from '../../kernel-integration/messages.js';
import { logger } from '../services/logger.js';
import { isErrorResponse } from '../utils.js';

/**
 * Hook to start polling for kernel status
 *
 * @param setStatus - Function to set the kernel status
 * @param sendMessage - Function to send a message to the kernel
 * @param interval - Polling interval in milliseconds
 */
export const useStatusPolling = (
  setStatus: (status: KernelStatus) => void,
  sendMessage: StreamState['sendMessage'],
  interval: number = 1000,
): void => {
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchStatus = async (): Promise<void> => {
      if (!sendMessage) {
        return;
      }
      try {
        const status = await sendMessage({
          method: KernelControlMethod.getStatus,
          params: null,
        });
        if (isErrorResponse(status)) {
          throw new Error(status.error);
        }
        setStatus(status);
      } catch (error) {
        logger.error('Failed to fetch status:', error);
      }
    };

    pollingRef.current = setInterval(() => {
      fetchStatus().catch(logger.error);
    }, interval);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [sendMessage, setStatus, interval]);
};
