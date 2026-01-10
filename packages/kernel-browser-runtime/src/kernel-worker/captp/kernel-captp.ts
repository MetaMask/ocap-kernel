import { makeCapTP } from '@endo/captp';
import type { Kernel, KRef } from '@metamask/ocap-kernel';
import type { Json } from '@metamask/utils';

import { makeKernelFacade } from './kernel-facade.ts';
import type { KrefWrapper } from '../../types.ts';

/**
 * A CapTP message that can be sent over the wire.
 */
export type CapTPMessage = Record<string, Json>;

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
  abort: (reason?: Json) => void;
};

/**
 * Check if an object is a kref wrapper that should be exported by CapTP.
 *
 * @param obj - The object to check.
 * @returns True if the object is a kref wrapper.
 */
function isKrefWrapper(obj: unknown): obj is KrefWrapper {
  // Only handle objects that are EXACTLY { kref: string }
  // Don't interfere with other objects like the kernel facade itself
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const keys = Object.keys(obj);
  return (
    keys.length === 1 &&
    keys[0] === 'kref' &&
    typeof (obj as KrefWrapper).kref === 'string' &&
    (obj as KrefWrapper).kref.startsWith('ko')
  );
}

/**
 * Create a proxy object that routes method calls to kernel.queueMessage().
 *
 * This proxy is what kernel-side code receives when background passes
 * a kref presence back as an argument.
 *
 * @param kref - The kernel reference string.
 * @param kernel - The kernel instance to route calls to.
 * @returns A proxy object that routes method calls.
 */
function makeKrefProxy(kref: KRef, kernel: Kernel): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_target, prop: string | symbol) {
        if (typeof prop !== 'string') {
          return undefined;
        }

        // Return a function that queues the message
        return async (...args: unknown[]) => {
          return kernel.queueMessage(kref, prop, args);
        };
      },
    },
  );
}

/**
 * Create custom CapTP import/export tables that handle krefs specially.
 *
 * Export side: When kernel returns CapData with krefs in slots, we convert
 * each kref into an exportable object that CapTP can marshal.
 *
 * Import side: When background sends a kref presence back, we convert it
 * back to the original kref for kernel.queueMessage().
 *
 * @param kernel - The kernel instance for routing messages.
 * @returns Import/export tables for CapTP.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function makeKrefTables(kernel: Kernel): {
  exportSlot: (passable: unknown) => string | undefined;
  importSlot: (slotId: string) => unknown;
  didDisconnect: () => void;
} {
  // Map kref strings to unique slot IDs for CapTP
  const krefToSlotId = new Map<string, string>();
  const slotIdToKref = new Map<string, string>();
  let nextSlotId = 0;

  // Map kref strings to proxy objects (for import side)
  const krefToProxy = new Map<string, object>();

  return {
    /**
     * Export: Convert kref wrapper objects into CapTP slot IDs.
     *
     * When kernel facade returns `{ kref: 'ko42' }`, this converts it to
     * a slot ID like 'kref:0' that CapTP can send to background.
     *
     * @param passable - The object to potentially export as a slot.
     * @returns Slot ID if the object is a kref wrapper, undefined otherwise.
     */
    exportSlot(passable: unknown): string | undefined {
      if (isKrefWrapper(passable)) {
        const { kref } = passable;

        // Get or create slot ID for this kref
        let slotId = krefToSlotId.get(kref);
        if (!slotId) {
          slotId = `kref:${nextSlotId}`;
          nextSlotId += 1;
          krefToSlotId.set(kref, slotId);
          slotIdToKref.set(slotId, kref);
        }

        return slotId;
      }
      return undefined;
    },

    /**
     * Import: Convert CapTP slot IDs back into kref proxy objects.
     *
     * When background sends a kref presence back as an argument, this
     * converts it to a proxy that routes calls to kernel.queueMessage().
     *
     * @param slotId - The CapTP slot ID to import.
     * @returns A proxy object for the kref, or undefined if unknown slot.
     */
    importSlot(slotId: string): unknown {
      const kref = slotIdToKref.get(slotId);
      if (!kref) {
        return undefined;
      }

      // Return cached proxy or create new one
      let proxy = krefToProxy.get(kref);
      if (!proxy) {
        proxy = makeKrefProxy(kref, kernel);
        krefToProxy.set(kref, proxy);
      }

      return proxy;
    },

    /**
     * Hook called when CapTP disconnects. Not used for kref marshalling.
     */
    didDisconnect() {
      // Clean up resources if needed
      krefToSlotId.clear();
      slotIdToKref.clear();
      krefToProxy.clear();
    },
  };
}

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

  // TODO: Custom kref tables for marshalling are currently disabled
  // They need further investigation to work correctly with CapTP's message flow
  // const krefTables = makeKrefTables(kernel);

  // Create the CapTP endpoint
  const { dispatch, abort } = makeCapTP('kernel', send, kernelFacade);

  return harden({
    dispatch,
    abort,
  });
}
harden(makeKernelCapTP);
