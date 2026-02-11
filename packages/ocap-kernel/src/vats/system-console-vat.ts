import { makeDefaultExo } from '@metamask/kernel-utils/exo';

import type {
  Baggage,
  ClusterConfig,
  KernelStatus,
  Subcluster,
} from '../types.ts';

type Callable = Record<string, (...args: unknown[]) => unknown>;

/**
 * Generate a short cattle name from a counter value.
 *
 * @param counter - The counter value.
 * @returns A cattle name string.
 */
function cattleName(counter: number): string {
  return `o${counter.toString(16).padStart(4, '0')}`;
}

/**
 * KernelFacet interface as seen from within a vat.
 */
type KernelFacet = {
  getStatus: () => Promise<KernelStatus>;
  getSubclusters: () => Promise<Subcluster[]>;
  launchSubcluster: (config: ClusterConfig) => Promise<{
    subclusterId: string;
    rootKref: string;
  }>;
  terminateSubcluster: (subclusterId: string) => Promise<void>;
  queueMessage: (
    target: string,
    method: string,
    args: unknown[],
  ) => Promise<unknown>;
};

/**
 * Services provided to the system console vat during bootstrap.
 */
type BootstrapServices = {
  kernelFacet?: KernelFacet;
  ocapURLIssuerService?: {
    issue: (object: unknown) => Promise<string>;
  };
};

/**
 * A single entry in the console namespace.
 */
type NamespaceEntry = {
  name: string;
  ref: unknown;
  petName?: string;
};

/**
 * Build the root object for a system console vat.
 *
 * The system console extends the basic console commands with kernel-level
 * operations via KernelFacet. It can launch subclusters, get kernel status,
 * create user consoles, and revoke itself to lock down the kernel.
 *
 * @param _vatPowers - The vat powers (unused).
 * @param _parameters - The vat parameters.
 * @param baggage - The vat's persistent baggage storage.
 * @returns The root object for the system console vat.
 */
export function buildRootObject(
  _vatPowers: unknown,
  _parameters: Record<string, unknown>,
  baggage: Baggage,
): object {
  let counter: number = baggage.has('counter')
    ? (baggage.get('counter') as number)
    : 0;

  let namespace: Map<string, NamespaceEntry> = baggage.has('namespace')
    ? (baggage.get('namespace') as Map<string, NamespaceEntry>)
    : new Map();

  let kernelFacet: KernelFacet | undefined = baggage.has('kernelFacet')
    ? (baggage.get('kernelFacet') as KernelFacet)
    : undefined;

  let revoked = baggage.has('revoked')
    ? (baggage.get('revoked') as boolean)
    : false;

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
    const direct = namespace.get(nameOrPet);
    if (direct) {
      return direct;
    }
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

  /**
   * Assert that the console has not been revoked.
   *
   * @throws If the console has been revoked.
   */
  function assertNotRevoked(): void {
    if (revoked) {
      throw Error('system console has been revoked');
    }
  }

  return makeDefaultExo('systemConsoleRoot', {
    /**
     * Bootstrap the system console vat.
     *
     * @param _vats - Sibling vats (unused).
     * @param services - Kernel services including kernelFacet.
     */
    async bootstrap(
      _vats: unknown,
      services: BootstrapServices,
    ): Promise<void> {
      if (!kernelFacet && services.kernelFacet) {
        kernelFacet = services.kernelFacet;
        baggage.init('kernelFacet', kernelFacet);
      }
    },

    // --- Core console commands ---

    /**
     * List available commands (including system commands).
     *
     * @returns Command descriptions.
     */
    help(): {
      commands: { name: string; usage: string; description: string }[];
    } {
      assertNotRevoked();
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
            description: 'Inspect a held capability',
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
          {
            name: 'launch',
            usage: 'launch <configJSON>',
            description: 'Launch a subcluster',
          },
          {
            name: 'terminate',
            usage: 'terminate <subclusterId>',
            description: 'Terminate a subcluster',
          },
          { name: 'status', usage: 'status', description: 'Get kernel status' },
          {
            name: 'revoke',
            usage: 'revoke',
            description: 'Revoke this system console',
          },
        ],
      };
    },

    /**
     * List held capabilities.
     *
     * @returns Namespace entries.
     */
    ls(): { entries: { name: string; petName?: string }[] } {
      assertNotRevoked();
      return { entries: listNamespace() };
    },

    /**
     * Inspect a held capability.
     *
     * @param ref - The cattle name or pet name.
     * @returns Inspection data.
     */
    async inspect(ref: string): Promise<unknown> {
      assertNotRevoked();
      const entry = lookupEntry(ref);
      if (!entry) {
        return { error: `unknown reference: ${ref}` };
      }
      const target = entry.ref as Callable;
      try {
        const description = await target.describe();
        return { ref: entry.name, petName: entry.petName, description };
      } catch {
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
     *
     * @param ref - The cattle name or pet name.
     * @param method - The method name.
     * @param args - The method arguments.
     * @returns The data result, or the cattle name of a stored capability.
     */
    async invoke(
      ref: string,
      method: string,
      ...args: unknown[]
    ): Promise<unknown> {
      assertNotRevoked();
      const entry = lookupEntry(ref);
      if (!entry) {
        return { error: `unknown reference: ${ref}` };
      }
      const invokeTarget = entry.ref as Callable;
      const result = await invokeTarget[method](...args);

      if (result !== null && typeof result === 'object') {
        try {
          await (result as Callable).__getMethodNames__();
          const cattleRef = addToNamespace(result);
          return { storedAs: cattleRef };
        } catch {
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
      assertNotRevoked();
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
     *
     * @param ref - The capability to store.
     * @returns The cattle name assigned.
     */
    receive(ref: unknown): string {
      assertNotRevoked();
      return addToNamespace(ref);
    },

    // --- System console commands ---

    /**
     * Launch a subcluster.
     *
     * @param config - The cluster configuration.
     * @returns Launch result with subcluster ID and root kref stored as cattle name.
     */
    async launch(config: ClusterConfig): Promise<unknown> {
      assertNotRevoked();
      if (!kernelFacet) {
        return { error: 'kernel facet not available' };
      }
      const result = await kernelFacet.launchSubcluster(config);
      return { subclusterId: result.subclusterId };
    },

    /**
     * Terminate a subcluster.
     *
     * @param subclusterId - The ID of the subcluster to terminate.
     * @returns Confirmation.
     */
    async terminate(subclusterId: string): Promise<unknown> {
      assertNotRevoked();
      if (!kernelFacet) {
        return { error: 'kernel facet not available' };
      }
      await kernelFacet.terminateSubcluster(subclusterId);
      return { terminated: subclusterId };
    },

    /**
     * Get kernel status.
     *
     * @returns The kernel status data.
     */
    async status(): Promise<unknown> {
      assertNotRevoked();
      if (!kernelFacet) {
        return { error: 'kernel facet not available' };
      }
      return kernelFacet.getStatus();
    },

    /**
     * Revoke this system console, locking down the kernel.
     * After revocation, all methods throw.
     *
     * @returns Confirmation that the console was revoked.
     */
    revoke(): { revoked: true } {
      assertNotRevoked();
      revoked = true;
      if (baggage.has('revoked')) {
        baggage.set('revoked', true);
      } else {
        baggage.init('revoked', true);
      }
      // Clear the namespace to release capability references
      namespace = new Map();
      persistNamespace();
      return { revoked: true };
    },
  });
}
