import { makeCapTP } from '@endo/captp';
import type { KernelFacade } from '@metamask/kernel-browser-runtime';
import type { JsonRpcMessage, JsonRpcCall } from '@metamask/kernel-utils';
import { hasProperty } from '@metamask/utils';

/**
 * A CapTP message that can be sent over the wire.
 */
export type CapTPMessage = Record<string, unknown>;

/**
 * Check if a message is a CapTP JSON-RPC notification.
 *
 * @param message - The message to check.
 * @returns True if the message is a CapTP notification.
 */
export function isCapTPNotification(message: JsonRpcMessage): boolean {
  return (
    hasProperty(message, 'method') &&
    message.method === 'captp' &&
    hasProperty(message, 'params') &&
    Array.isArray(message.params) &&
    message.params.length === 1
  );
}

/**
 * Extract the CapTP message from a notification.
 *
 * @param message - The notification message.
 * @returns The CapTP message.
 */
export function getCapTPMessage(message: JsonRpcMessage): CapTPMessage {
  if (!isCapTPNotification(message)) {
    throw new Error('Not a CapTP notification');
  }
  return (message as unknown as { params: [CapTPMessage] }).params[0];
}

/**
 * Create a CapTP JSON-RPC notification.
 *
 * @param captpMessage - The CapTP message to wrap.
 * @returns The JSON-RPC notification.
 */
export function makeCapTPNotification(captpMessage: CapTPMessage): JsonRpcCall {
  return {
    jsonrpc: '2.0',
    method: 'captp',
    params: [captpMessage as unknown as Record<string, never>],
  };
}

/**
 * Options for creating a background CapTP endpoint.
 */
export type BackgroundCapTPOptions = {
  /**
   * Function to send CapTP messages to the kernel.
   *
   * @param message - The CapTP message to send.
   */
  send: (message: CapTPMessage) => void;
};

/**
 * The background's CapTP endpoint.
 */
export type BackgroundCapTP = {
  /**
   * Dispatch an incoming CapTP message from the kernel.
   *
   * @param message - The CapTP message to dispatch.
   * @returns True if the message was handled.
   */
  dispatch: (message: CapTPMessage) => boolean;

  /**
   * Get the remote kernel facade.
   * This is how the background calls kernel methods using E().
   *
   * @returns A promise for the kernel facade remote presence.
   */
  getKernel: () => Promise<KernelFacade>;

  /**
   * Abort the CapTP connection.
   *
   * @param reason - The reason for aborting.
   */
  abort: (reason?: unknown) => void;
};

/**
 * Create a CapTP endpoint for the background script.
 *
 * This sets up a CapTP connection to the kernel. The background can then use
 * `E(kernel).method()` to call kernel methods.
 *
 * @param options - The options for creating the CapTP endpoint.
 * @returns The background CapTP endpoint.
 */
export function makeBackgroundCapTP(
  options: BackgroundCapTPOptions,
): BackgroundCapTP {
  const { send } = options;

  // Create the CapTP endpoint (no bootstrap - we only want to call the kernel)
  const { dispatch, getBootstrap, abort } = makeCapTP(
    'background',
    send,
    undefined,
  );

  return harden({
    dispatch,
    getKernel: getBootstrap as () => Promise<KernelFacade>,
    abort,
  });
}
harden(makeBackgroundCapTP);
