import { stringify } from '@metamask/kernel-utils';
import type { KernelStatus } from '@metamask/ocap-kernel';
import { hasProperty } from '@metamask/utils';
import { useEffect, useRef, useState } from 'react';

import type { StreamState } from './useStream.ts';
import { logger } from '../services/logger.ts';

export type StatusPollingResult = {
  /**
   * The most recent status successfully fetched, retained when a later poll
   * fails so that the panel can keep showing what was last known. Read it
   * together with `isUnreachable`, which says whether it is still current.
   */
  status: KernelStatus | undefined;
  /**
   * Whether the most recent poll failed. Distinguishes "the kernel told us it
   * is broken" from "we cannot ask the kernel anything", which look identical
   * if only `status` is consulted.
   */
  isUnreachable: boolean;
};

/**
 * Hook to start polling for kernel status
 *
 * @param callKernelMethod - Function to send a message to the kernel
 * @param isRequestInProgress - Ref to track if a request is in progress
 * @param interval - Polling interval in milliseconds
 * @returns The last known kernel status and whether it is still current.
 */
export const useStatusPolling = (
  callKernelMethod: StreamState['callKernelMethod'],
  isRequestInProgress: React.RefObject<boolean>,
  interval: number = 1000,
): StatusPollingResult => {
  const pollingRef = useRef<NodeJS.Timeout>();
  const [status, setStatus] = useState<KernelStatus>();
  const [isUnreachable, setIsUnreachable] = useState(false);

  /**
   * Effect to start polling for kernel status.
   */
  useEffect(() => {
    const fetchStatus = async (): Promise<void> => {
      // Not an attempt, so it says nothing about whether the kernel can be
      // reached: leave the previous verdict alone rather than clearing it.
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
        setIsUnreachable(false);
      } catch (error) {
        logger.error('Failed to fetch status:', error);
        setIsUnreachable(true);
      }
    };

    pollingRef.current = setInterval(() => {
      fetchStatus().catch(logger.error);
    }, interval);

    fetchStatus().catch(logger.error);

    return () => {
      clearInterval(pollingRef.current);
    };
  }, [callKernelMethod, interval, isRequestInProgress]);

  return { status, isUnreachable };
};
