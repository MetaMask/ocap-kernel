/**
 * Presence manager for creating E()-usable presences from kernel krefs.
 *
 * This module provides "slot translation" - converting kernel krefs (ko*, kp*)
 * into presences that can receive eventual sends via E(). Method calls on these
 * presences are forwarded to kernel.queueMessage() through the existing CapTP
 * connection.
 */
import { E, HandledPromise } from '@endo/eventual-send';
import type { EHandler } from '@endo/eventual-send';
import { makeMarshal, Remotable } from '@endo/marshal';
import type { CapData } from '@endo/marshal';

import type { Kernel } from './Kernel.ts';
import { kslot } from './liveslots/kernel-marshal.ts';
import type { KRef } from './types.ts';

type Methods = Record<string, (...args: unknown[]) => unknown>;

/**
 * Function type for sending messages to the kernel.
 */
type SendToKernelFn = (
  kref: string,
  method: string,
  args: unknown[],
) => Promise<unknown>;

/**
 * Recursively convert kref strings in a value to kernel standins.
 *
 * When the background sends kref strings as arguments, we need to convert
 * them to standin objects that kernel-marshal can serialize properly.
 *
 * @param value - The value to convert.
 * @returns The value with kref strings converted to standins.
 */
export function convertKrefsToStandins(value: unknown): unknown {
  // Check if it's a kref string (ko* or kp*)
  if (typeof value === 'string' && /^k[op]\d+$/u.test(value)) {
    return kslot(value);
  }
  // Recursively process arrays
  if (Array.isArray(value)) {
    return value.map(convertKrefsToStandins);
  }
  // Recursively process plain objects
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = convertKrefsToStandins(val);
    }
    return result;
  }
  // Return primitives as-is
  return value;
}
harden(convertKrefsToStandins);

/**
 * Minimal interface for kernel-like objects that can queue messages.
 * Both Kernel and KernelFacade (from kernel-browser-runtime) satisfy this.
 */
export type KernelLike = {
  queueMessage: Kernel['queueMessage'];
};

/**
 * Options for creating a presence manager.
 */
export type PresenceManagerOptions = {
  /**
   * A kernel or kernel facade that can queue messages.
   * Can be a promise since E() works with promises.
   */
  kernelFacade: KernelLike | Promise<KernelLike>;
};

/**
 * The presence manager interface.
 */
export type PresenceManager = {
  /**
   * Resolve a kref string to an E()-usable presence.
   *
   * @param kref - The kernel reference string (e.g., 'ko42', 'kp123').
   * @returns A presence that can receive E() calls.
   */
  resolveKref: (kref: KRef) => Methods;

  /**
   * Extract the kref from a presence.
   *
   * @param presence - A presence created by resolveKref.
   * @returns The kref string, or undefined if not a kref presence.
   */
  krefOf: (presence: object) => KRef | undefined;

  /**
   * Deserialize a CapData result into presences.
   *
   * @param data - The CapData to deserialize.
   * @returns The deserialized value with krefs converted to presences.
   */
  fromCapData: (data: CapData<KRef>) => unknown;
};

/**
 * Create a remote kit for a kref, similar to CapTP's makeRemoteKit.
 * Returns a settler that can create an E()-callable presence.
 *
 * @param kref - The kernel reference string.
 * @param sendToKernel - Function to send messages to the kernel.
 * @returns An object with a resolveWithPresence method.
 */
function makeKrefRemoteKit(
  kref: string,
  sendToKernel: SendToKernelFn,
): { resolveWithPresence: () => object } {
  // Handler that intercepts E() calls on the presence
  const handler: EHandler<object> = {
    async get(_target, prop) {
      if (typeof prop !== 'string') {
        return undefined;
      }
      // Property access: E(presence).prop returns a promise
      return sendToKernel(kref, prop, []);
    },
    async applyMethod(_target, prop, args) {
      if (typeof prop !== 'string') {
        throw new Error('Method name must be a string');
      }
      // Method call: E(presence).method(args)
      return sendToKernel(kref, prop, args);
    },
    applyFunction(_target, _args) {
      // Function call: E(presence)(args) - not supported for kref presences
      throw new Error('Cannot call kref presence as a function');
    },
  };

  let resolveWithPresenceFn:
    | ((presenceHandler: EHandler<object>) => object)
    | undefined;

  // Create a HandledPromise to get access to resolveWithPresence
  // We don't actually use the promise - we just need the resolver
  // eslint-disable-next-line no-new, @typescript-eslint/no-floating-promises
  new HandledPromise((_resolve, _reject, resolveWithPresence) => {
    resolveWithPresenceFn = resolveWithPresence;
  }, handler);

  return {
    resolveWithPresence: () => {
      if (!resolveWithPresenceFn) {
        throw new Error('resolveWithPresence not initialized');
      }
      return resolveWithPresenceFn(handler);
    },
  };
}

/**
 * Create an E()-usable presence for a kref.
 *
 * @param kref - The kernel reference string.
 * @param iface - Interface name for the remotable.
 * @param sendToKernel - Function to send messages to the kernel.
 * @returns A presence that can receive E() calls.
 */
function makeKrefPresence(
  kref: string,
  iface: string,
  sendToKernel: SendToKernelFn,
): Methods {
  const kit = makeKrefRemoteKit(kref, sendToKernel);
  // Wrap the presence in Remotable for proper pass-style
  return Remotable(iface, undefined, kit.resolveWithPresence()) as Methods;
}

/**
 * Create a presence manager for E() on vat objects.
 *
 * This creates presences from kernel krefs that forward method calls
 * to kernel.queueMessage() via the existing CapTP connection.
 *
 * @param options - Options including the kernel facade.
 * @returns The presence manager.
 */
export function makePresenceManager(
  options: PresenceManagerOptions,
): PresenceManager {
  const { kernelFacade } = options;

  // State for kref↔presence mapping
  const krefToPresence = new Map<KRef, Methods>();
  const presenceToKref = new WeakMap<object, KRef>();

  // Forward declaration for sendToKernel
  // eslint-disable-next-line prefer-const
  let marshal: ReturnType<typeof makeMarshal<string>>;

  /**
   * Recursively convert presence objects directly to kernel standins.
   *
   * This combines two conversions in one pass:
   * 1. Presences → kref strings (via presenceToKref WeakMap lookup)
   * 2. Kref strings → standins (via kslot)
   *
   * The kernel's queueMessage uses kser() which expects standin objects,
   * not presences or raw kref strings.
   *
   * @param value - The value to convert.
   * @returns The value with presences converted to standins.
   */
  const convertPresencesToStandins = (value: unknown): unknown => {
    // Check if it's a known presence - convert directly to standin
    if (typeof value === 'object' && value !== null) {
      const kref = presenceToKref.get(value);
      if (kref !== undefined) {
        return kslot(kref);
      }
      // Recursively process arrays
      if (Array.isArray(value)) {
        return value.map(convertPresencesToStandins);
      }
      // Recursively process plain objects
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = convertPresencesToStandins(val);
      }
      return result;
    }
    // Return primitives as-is
    return value;
  };

  /**
   * Send a message to the kernel and deserialize the result.
   *
   * @param kref - The target kernel reference.
   * @param method - The method name to call.
   * @param args - Arguments to pass to the method.
   * @returns The deserialized result from the kernel.
   */
  const sendToKernel: SendToKernelFn = async (
    kref: KRef,
    method: string,
    args: unknown[],
  ): Promise<unknown> => {
    // Convert presence args directly to standins for kernel serialization
    const serializedArgs = args.map(convertPresencesToStandins);

    // Call kernel via existing CapTP
    const result: CapData<KRef> = await E(kernelFacade).queueMessage(
      kref,
      method,
      serializedArgs,
    );

    // Deserialize result (krefs become presences)
    return marshal.fromCapData(result);
  };

  /**
   * Convert a kref slot to a presence.
   *
   * @param kref - The kernel reference string.
   * @param iface - Optional interface name for the presence.
   * @returns A presence object that can receive E() calls.
   */
  const convertSlotToVal = (kref: KRef, iface?: string): Methods => {
    let presence = krefToPresence.get(kref);
    if (!presence) {
      presence = makeKrefPresence(
        kref,
        iface ?? 'Alleged: VatObject',
        sendToKernel,
      );
      krefToPresence.set(kref, presence);
      presenceToKref.set(presence, kref);
    }
    return presence;
  };

  /**
   * Convert a presence to a kref slot.
   * This is called by the marshal for pass-by-presence objects.
   * Throws if the object is not a known kref presence.
   *
   * @param val - The value to convert to a kref.
   * @returns The kernel reference string.
   */
  const convertValToSlot = (val: unknown): KRef => {
    if (typeof val === 'object' && val !== null) {
      const kref = presenceToKref.get(val);
      if (kref !== undefined) {
        return kref;
      }
    }
    throw new Error('Cannot serialize unknown remotable object');
  };

  // Same options as kernel-marshal.ts
  marshal = makeMarshal(convertValToSlot, convertSlotToVal, {
    serializeBodyFormat: 'smallcaps',
    errorTagging: 'off',
  });

  return harden({
    resolveKref: (kref: KRef): Methods => {
      return convertSlotToVal(kref, 'Alleged: VatObject');
    },

    krefOf: (presence: object): KRef | undefined => {
      return presenceToKref.get(presence);
    },

    fromCapData: (data: CapData<KRef>): unknown => {
      return marshal.fromCapData(data);
    },
  });
}
harden(makePresenceManager);
