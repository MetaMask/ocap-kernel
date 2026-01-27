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
  kernel: KernelLike | Promise<KernelLike>;
};

/**
 * The presence manager interface.
 */
export type PresenceManager = {
  /**
   * Resolve a kref string to an E()-usable presence or tracked promise.
   *
   * For object refs (ko*): Returns a presence that can receive E() calls.
   * For promise refs (p*, kp*, rp*): Returns a tracked Promise.
   *
   * @param kref - The kernel reference string (e.g., 'ko42', 'kp123').
   * @returns A presence or tracked promise.
   */
  resolveKref: (kref: KRef) => Methods | Promise<unknown>;

  /**
   * Extract the kref from a presence or tracked promise.
   *
   * @param value - A presence or tracked promise created by resolveKref.
   * @returns The kref string, or undefined if not a tracked value.
   */
  krefOf: (value: object) => KRef | undefined;

  /**
   * Deserialize a CapData result into presences/promises.
   *
   * @param data - The CapData to deserialize.
   * @returns The deserialized value with krefs converted to presences/promises.
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
 * Check if a kref is a promise reference.
 * Promise krefs can start with 'p', 'kp', or 'rp'.
 *
 * @param kref - The kernel reference string.
 * @returns True if the kref is a promise reference.
 */
const isPromiseRef = (kref: string): boolean =>
  kref.startsWith('p') || kref.startsWith('kp') || kref.startsWith('rp');

/**
 * Create a presence manager for E() on vat objects.
 *
 * This creates presences from kernel krefs that forward method calls
 * to kernel.queueMessage() via the existing CapTP connection.
 *
 * @param options - Options including the kernel facade.
 * @param options.kernel - The kernel instance or presence.
 * @returns The presence manager.
 */
export function makePresenceManager({
  kernel,
}: PresenceManagerOptions): PresenceManager {
  // State for kref↔presence mapping (for ko* object refs)
  const krefToPresence = new Map<KRef, Methods>();
  const presenceToKref = new WeakMap<object, KRef>();

  // State for kref↔promise mapping (for p*, kp*, rp* promise refs)
  const krefToPromise = new Map<KRef, Promise<unknown>>();
  const promiseToKref = new WeakMap<object, KRef>();

  // Forward declaration for sendToKernel
  // eslint-disable-next-line prefer-const
  let marshal: ReturnType<typeof makeMarshal<string>>;

  /**
   * Recursively convert presence/promise objects directly to kernel standins.
   *
   * This combines conversions in one pass:
   * 1. Presences (ko* refs) → kref strings (via presenceToKref WeakMap lookup)
   * 2. Tracked promises (kp* refs) → kref strings (via promiseToKref WeakMap lookup)
   * 3. E() HandledPromises → await to get underlying tracked value
   * 4. Kref strings → standins (via kslot)
   *
   * The kernel's queueMessage uses kser() which expects standin objects,
   * not presences or raw kref strings.
   *
   * @param value - The value to convert.
   * @returns The value with presences/promises converted to standins.
   */
  const convertPresencesToStandins = async (
    value: unknown,
  ): Promise<unknown> => {
    // If it's a Promise, await it to get the tracked value
    // E() returns HandledPromises that wrap presences/tracked promises
    if (value instanceof Promise) {
      const resolved = await value;
      return convertPresencesToStandins(resolved);
    }

    // Check if it's a known presence or tracked promise - convert to standin
    if (typeof value === 'object' && value !== null) {
      // Check presence map (ko* refs)
      const presenceKref = presenceToKref.get(value);
      if (presenceKref !== undefined) {
        return kslot(presenceKref);
      }
      // Check promise map (kp* refs)
      const promiseKref = promiseToKref.get(value);
      if (promiseKref !== undefined) {
        return kslot(promiseKref);
      }
      // Recursively process arrays
      if (Array.isArray(value)) {
        return Promise.all(value.map(convertPresencesToStandins));
      }
      // Recursively process plain objects
      const entries = await Promise.all(
        Object.entries(value).map(async ([key, val]) => [
          key,
          await convertPresencesToStandins(val),
        ]),
      );
      return Object.fromEntries(entries);
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
    // Convert presence/promise args to standins for kernel serialization
    // Also awaits E() HandledPromises to get underlying tracked values
    const serializedArgs = await Promise.all(
      args.map(convertPresencesToStandins),
    );

    // Call kernel via existing CapTP
    const result: CapData<KRef> = await E(kernel).queueMessage(
      kref,
      method,
      serializedArgs,
    );

    // Deserialize result (krefs become presences)
    return marshal.fromCapData(result);
  };

  /**
   * Convert a kref slot to a presence or tracked promise.
   *
   * For object refs (ko*): Creates an E()-callable presence.
   * For promise refs (p*, kp*, rp*): Creates a tracked Promise tagged with the kref.
   *
   * @param kref - The kernel reference string.
   * @param iface - Optional interface name for the presence.
   * @returns A presence object or tracked promise.
   */
  const convertSlotToVal = (
    kref: KRef,
    iface?: string,
  ): Methods | Promise<unknown> => {
    // Handle promise krefs (p*, kp*, rp*) - create tracked Promise
    if (isPromiseRef(kref)) {
      let tracked = krefToPromise.get(kref);
      if (!tracked) {
        // Create a standin promise tagged with the kref (like kernel-marshal does)
        const standinP = Promise.resolve(`${kref} stand in`);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Object.defineProperty(standinP, Symbol.toStringTag, {
          value: kref,
          enumerable: false,
        });
        tracked = harden(standinP);
        krefToPromise.set(kref, tracked);
        promiseToKref.set(tracked, kref);
      }
      return tracked;
    }

    // Handle object krefs (ko*) - create presence
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
   * Convert a presence or tracked promise to a kref slot.
   * This is called by the marshal for pass-by-presence objects.
   * Throws if the object is not a known kref presence or tracked promise.
   *
   * @param val - The value to convert to a kref.
   * @returns The kernel reference string.
   */
  const convertValToSlot = (val: unknown): KRef => {
    if (typeof val === 'object' && val !== null) {
      // Check presence map (ko* refs)
      const presenceKref = presenceToKref.get(val);
      if (presenceKref !== undefined) {
        return presenceKref;
      }
      // Check promise map (kp* refs)
      const promiseKref = promiseToKref.get(val);
      if (promiseKref !== undefined) {
        return promiseKref;
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
    resolveKref: (kref: KRef): Methods | Promise<unknown> => {
      return convertSlotToVal(kref, 'Alleged: VatObject');
    },

    krefOf: (value: object): KRef | undefined => {
      // Check presence map (ko* refs)
      const presenceKref = presenceToKref.get(value);
      if (presenceKref !== undefined) {
        return presenceKref;
      }
      // Check promise map (kp* refs)
      return promiseToKref.get(value);
    },

    fromCapData: (data: CapData<KRef>): unknown => {
      return marshal.fromCapData(data);
    },
  });
}
harden(makePresenceManager);
