import { makeDefaultExo } from '@metamask/kernel-utils/exo';

import type { Baggage } from '../types.ts';

type Callable = Record<string, (...args: unknown[]) => unknown>;

/**
 * Generate a short cattle name from a counter value.
 * Produces hex-based names like `o0000`, `o0001`, `o001f`.
 *
 * @param counter - The counter value.
 * @returns A cattle name string.
 */
function cattleName(counter: number): string {
  return `o${counter.toString(16).padStart(4, '0')}`;
}

/**
 * Services provided to the console vat during bootstrap.
 */
type BootstrapServices = Record<string, unknown>;

/**
 * A single entry in the console namespace.
 */
type NamespaceEntry = {
  name: string;
  ref: unknown;
  petName?: string;
};

/**
 * Build the root object for a console vat.
 *
 * The console vat maintains a namespace of held capabilities and interprets
 * user commands. All results returned to the caller are data — capabilities
 * are stored in the namespace and referenced by name.
 *
 * @param _vatPowers - The vat powers (unused).
 * @param _parameters - The vat parameters.
 * @param baggage - The vat's persistent baggage storage.
 * @returns The root object for the console vat.
 */
export function buildRootObject(
  _vatPowers: unknown,
  _parameters: Record<string, unknown>,
  baggage: Baggage,
): object {
  // Restore or initialize the namespace counter
  let counter: number = baggage.has('counter')
    ? (baggage.get('counter') as number)
    : 0;

  // Restore or initialize the namespace entries.
  // The namespace maps cattle names to entries containing the reference and
  // an optional pet name. Baggage stores the full map.
  const namespace: Map<string, NamespaceEntry> = baggage.has('namespace')
    ? (baggage.get('namespace') as Map<string, NamespaceEntry>)
    : new Map();

  /**
   * Persist the current namespace state to baggage.
   */
  function persistNamespace(): void {
    if (baggage.has('namespace')) {
      baggage.set('namespace', namespace);
    } else {
      baggage.init('namespace', namespace);
    }
  }

  /**
   * Persist the counter to baggage.
   */
  function persistCounter(): void {
    if (baggage.has('counter')) {
      baggage.set('counter', counter);
    } else {
      baggage.init('counter', counter);
    }
  }

  /**
   * Add a capability to the namespace with a cattle name.
   *
   * @param ref - The capability reference.
   * @returns The cattle name assigned.
   */
  function addToNamespace(ref: unknown): string {
    const name = cattleName(counter);
    counter += 1;
    persistCounter();
    namespace.set(name, { name, ref });
    persistNamespace();
    return name;
  }

  /**
   * Look up a reference by cattle name or pet name.
   *
   * @param nameOrPet - The cattle name or pet name.
   * @returns The namespace entry, or undefined.
   */
  function lookupEntry(nameOrPet: string): NamespaceEntry | undefined {
    // Direct cattle name lookup
    const direct = namespace.get(nameOrPet);
    if (direct) {
      return direct;
    }
    // Search by pet name
    for (const entry of namespace.values()) {
      if (entry.petName === nameOrPet) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * Format the namespace listing as data for the caller.
   *
   * @returns An array of namespace entry summaries.
   */
  function listNamespace(): { name: string; petName?: string }[] {
    const entries: { name: string; petName?: string }[] = [];
    for (const entry of namespace.values()) {
      const item: { name: string; petName?: string } = { name: entry.name };
      if (entry.petName) {
        item.petName = entry.petName;
      }
      entries.push(item);
    }
    return entries;
  }

  return makeDefaultExo('consoleRoot', {
    /**
     * Bootstrap the console vat.
     *
     * @param _vats - Sibling vats (unused).
     * @param _services - Kernel services.
     */
    async bootstrap(
      _vats: unknown,
      _services: BootstrapServices,
    ): Promise<void> {
      // No-op for user console; system console overrides this.
    },

    /**
     * List available commands.
     *
     * @returns A list of command descriptions.
     */
    help(): {
      commands: { name: string; usage: string; description: string }[];
    } {
      return {
        commands: [
          {
            name: 'help',
            usage: 'help',
            description: 'List available commands',
          },
          { name: 'ls', usage: 'ls', description: 'List held capabilities' },
          {
            name: 'inspect',
            usage: 'inspect <ref>',
            description: 'Inspect a held capability for methods and schema',
          },
          {
            name: 'invoke',
            usage: 'invoke <ref> <method> [...args]',
            description: 'Invoke a method on a held capability',
          },
          {
            name: 'name',
            usage: 'name <ref> <petname>',
            description: 'Assign a pet name to a held reference',
          },
        ],
      };
    },

    /**
     * List held capabilities in the namespace.
     *
     * @returns The namespace entries.
     */
    ls(): { entries: { name: string; petName?: string }[] } {
      return { entries: listNamespace() };
    },

    /**
     * Inspect a held capability for its methods and schema.
     *
     * @param ref - The cattle name or pet name of the capability.
     * @returns Inspection data.
     */
    async inspect(ref: string): Promise<unknown> {
      const entry = lookupEntry(ref);
      if (!entry) {
        return { error: `unknown reference: ${ref}` };
      }
      const target = entry.ref as Callable;
      try {
        const description = await target.describe();
        return { ref: entry.name, petName: entry.petName, description };
      } catch {
        // Fallback: try __getMethodNames__
        try {
          const methods = await target.__getMethodNames__();
          return { ref: entry.name, petName: entry.petName, methods };
        } catch {
          return {
            ref: entry.name,
            petName: entry.petName,
            description: 'not inspectable',
          };
        }
      }
    },

    /**
     * Invoke a method on a held capability.
     * Returns data results directly. Capability results are stored in the
     * namespace and the cattle name is returned instead.
     *
     * @param ref - The cattle name or pet name of the target.
     * @param method - The method name.
     * @param args - The method arguments (data only).
     * @returns The data result, or the cattle name of a stored capability.
     */
    async invoke(
      ref: string,
      method: string,
      ...args: unknown[]
    ): Promise<unknown> {
      const entry = lookupEntry(ref);
      if (!entry) {
        return { error: `unknown reference: ${ref}` };
      }
      const target = entry.ref as Callable;
      const result = await target[method](...args);

      // If the result is a remotable (has __getMethodNames__ or similar),
      // store it in the namespace and return the name.
      if (result !== null && typeof result === 'object') {
        try {
          // Probe if it's remotable by checking for method names
          await (result as Callable).__getMethodNames__();
          // It's a capability — store it
          const cattleRef = addToNamespace(result);
          return { storedAs: cattleRef };
        } catch {
          // Not a remotable — return as data
          return result;
        }
      }
      return result;
    },

    /**
     * Assign a pet name to a held reference.
     *
     * @param ref - The cattle name of the target.
     * @param petName - The pet name to assign.
     * @returns Confirmation.
     */
    name(
      ref: string,
      petName: string,
    ): { named: string; as: string } | { error: string } {
      const entry = lookupEntry(ref);
      if (!entry) {
        return { error: `unknown reference: ${ref}` };
      }
      entry.petName = petName;
      persistNamespace();
      return { named: entry.name, as: petName };
    },

    /**
     * Accept a capability and store it in the namespace.
     * Used by other vats (e.g., system console) to grant capabilities.
     *
     * @param ref - The capability to store.
     * @returns The cattle name assigned.
     */
    receive(ref: unknown): string {
      return addToNamespace(ref);
    },
  });
}
