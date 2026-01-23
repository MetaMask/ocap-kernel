import { makeCapTP } from '@endo/captp';
import type { Kernel } from '@metamask/ocap-kernel';

import { makeKernelFacade } from './kernel-facade.ts';
import type { CapTPMessage } from '../../types.ts';

/**
 * Options for creating a kernel CapTP endpoint.
 */
export type KernelCapTPOptions = {
  /**
   * The kernel instance to expose via CapTP.
   */
  kernel: Kernel;

  /**
   * Function to send CapTP messages to the background.
   *
   * @param message - The CapTP message to send.
   */
  send: (message: CapTPMessage) => void;
};

/**
 * The kernel's CapTP endpoint.
 */
export type KernelCapTP = {
  /**
   * Dispatch an incoming CapTP message from the background.
   *
   * @param message - The CapTP message to dispatch.
   * @returns True if the message was handled.
   */
  dispatch: (message: CapTPMessage) => boolean;

  /**
   * Abort the CapTP connection.
   *
   * @param reason - The reason for aborting.
   */
  abort: (reason?: unknown) => void;
};

/**
 * Create a CapTP endpoint for the kernel.
 *
 * This sets up a CapTP connection that exposes the kernel facade as the
 * bootstrap object. The background can then use `E(kernel).method()` to
 * call kernel methods.
 *
 * @param options - The options for creating the CapTP endpoint.
 * @returns The kernel CapTP endpoint.
 */
export function makeKernelCapTP(options: KernelCapTPOptions): KernelCapTP {
  const { kernel, send } = options;

  // Create the kernel facade that will be exposed to the background
  const kernelFacade = makeKernelFacade(kernel);

  // Create the CapTP endpoint
  const { dispatch, abort } = makeCapTP('kernel', send, kernelFacade);

  return harden({
    dispatch,
    abort,
  });
}
harden(makeKernelCapTP);
