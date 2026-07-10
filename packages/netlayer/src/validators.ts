import { ResourceLimitError } from '@metamask/kernel-errors';

import { DEFAULT_MAX_MESSAGE_SIZE_BYTES } from './constants.ts';

/**
 * Creates a message size validator function.
 *
 * @param maxMessageSizeBytes - Maximum allowed message size in bytes.
 * @returns A function that validates message size.
 */
export function makeMessageSizeValidator(
  maxMessageSizeBytes = DEFAULT_MAX_MESSAGE_SIZE_BYTES,
): (message: string) => void {
  const encoder = new TextEncoder();

  return (message: string): void => {
    const messageSizeBytes = encoder.encode(message).length;
    if (messageSizeBytes > maxMessageSizeBytes) {
      throw new ResourceLimitError(
        `Message size ${messageSizeBytes} bytes exceeds limit of ${maxMessageSizeBytes} bytes`,
        {
          data: {
            limitType: 'messageSize',
            current: messageSizeBytes,
            limit: maxMessageSizeBytes,
          },
        },
      );
    }
  };
}

/**
 * Creates a connection limit checker function.
 *
 * @param maxConcurrentConnections - Maximum allowed concurrent connections.
 * @param getActiveConnectionCount - Function to get current active connection count.
 * @returns A function that checks connection limits.
 */
export function makeConnectionLimitChecker(
  maxConcurrentConnections: number,
  getActiveConnectionCount: () => number,
): () => void {
  return (): void => {
    const currentConnections = getActiveConnectionCount();
    if (currentConnections >= maxConcurrentConnections) {
      throw new ResourceLimitError(
        `Connection limit reached: ${currentConnections}/${maxConcurrentConnections} concurrent connections`,
        {
          data: {
            limitType: 'connection',
            current: currentConnections,
            limit: maxConcurrentConnections,
          },
        },
      );
    }
  };
}
