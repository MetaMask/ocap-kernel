import { stringify } from '@ocap/utils';
import { useCallback } from 'react';

import type { OutputType } from './useOutput.js';
import type {
  KernelControlReply,
  KernelStatus,
} from '../../kernel-integration/messages.js';
import {
  isKernelControlReply,
  isKernelStatus,
} from '../../kernel-integration/messages.js';
import { isErrorResponse } from '../utils.js';

/**
 * Hook to handle kernel messages.
 *
 * @param setStatus - The function to set the kernel status.
 * @param showOutput - The function to show the output.
 * @returns The function to handle kernel messages.
 */
export const useMessageHandler = (
  setStatus: (status: KernelStatus) => void,
  showOutput: (message: string, type?: OutputType) => void,
): ((message: KernelControlReply) => void) => {
  // Handle kernel messages
  const handleKernelMessage = useCallback(
    (message: KernelControlReply) => {
      if (!isKernelControlReply(message) || message.params === null) {
        showOutput('');
        return;
      }

      if (isKernelStatus(message.params)) {
        setStatus(message.params);
        return;
      }

      if (isErrorResponse(message.params)) {
        showOutput(stringify(message.params.error, 0), 'error');
      } else {
        showOutput(stringify(message.params, 2), 'info');
      }
    },
    [setStatus, showOutput],
  );

  return handleKernelMessage;
};
