import { useEffect, useRef } from 'react';

import type {
  KernelControlCommand,
  KernelStatus,
} from '../../kernel-integration/messages.js';
import { logger } from '../services/logger.js';

/**
 * Hook to start polling for kernel status
 *
 * @param setStatus - Function to set the kernel status
 * @param sendMessage - Function to send a message to the kernel
 * @param interval - Polling interval in milliseconds
 */
export const useStatusPolling = (
  setStatus: (status: KernelStatus) => void,
  sendMessage?: (message: KernelControlCommand) => Promise<void>,
  interval: number = 1000,
): void => {
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Start polling for kernel status
  useEffect(() => {
    const fetchStatus = async (): Promise<void> => {
      if (!sendMessage) {
        return;
      }
      await sendMessage({ method: 'getStatus', params: null });
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
