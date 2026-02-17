// eslint-disable-next-line import-x/no-extraneous-dependencies, n/no-extraneous-import -- vat dependency provided by kernel runtime
import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

import type {
  Baggage,
  ClusterConfig,
  KernelStatus,
  Subcluster,
  SubclusterLaunchResult,
} from '../types.ts';

/**
 * Kernel facet interface for system vat operations.
 */
type KernelFacet = {
  getStatus: () => Promise<KernelStatus>;
  getSubclusters: () => Promise<Subcluster[]>;
  launchSubcluster: (config: ClusterConfig) => Promise<SubclusterLaunchResult>;
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
  console?: IOService;
};

/**
 * IO service interface for reading and writing lines.
 */
type IOService = {
  read: () => Promise<string | null>;
  write: (data: string) => Promise<void>;
};

/**
 * A JSON request from the CLI.
 */
type Request = {
  ref?: string;
  method: string;
  args?: unknown[];
};

/**
 * Build function for the system console vat.
 *
 * This vat manages the REPL loop over an IO channel, dispatching CLI
 * commands and managing refs (capability references) in persistent baggage.
 *
 * @param _vatPowers - The vat powers (unused).
 * @param _parameters - The vat parameters (unused).
 * @param _parameters.name - Optional name for the console vat.
 * @param baggage - The vat's persistent baggage storage.
 * @returns The root object for the new vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  _vatPowers: unknown,
  _parameters: { name?: string },
  baggage: Baggage,
) {
  // Monotonic counter for generating unique ref identifiers (persisted in baggage)
  let refCounter: number = baggage.has('refCounter')
    ? (baggage.get('refCounter') as number)
    : 0;
  // Restore kernel facet from baggage if available (for resuscitation)
  let kernelFacet: KernelFacet | undefined = baggage.has('kernelFacet')
    ? (baggage.get('kernelFacet') as KernelFacet)
    : undefined;

  // Ref manager state in baggage: ref → kref and kref → ref maps
  // Stored as plain objects since baggage serializes them
  const refs: Record<string, string> = baggage.has('refs')
    ? (baggage.get('refs') as Record<string, string>)
    : {};
  const krefToRef: Record<string, string> = baggage.has('krefToRef')
    ? (baggage.get('krefToRef') as Record<string, string>)
    : {};

  /**
   * Persist the current ref state to baggage.
   */
  function persistRefs(): void {
    if (baggage.has('refs')) {
      baggage.set('refs', harden({ ...refs }));
    } else {
      baggage.init('refs', harden({ ...refs }));
    }
    if (baggage.has('krefToRef')) {
      baggage.set('krefToRef', harden({ ...krefToRef }));
    } else {
      baggage.init('krefToRef', harden({ ...krefToRef }));
    }
  }

  /**
   * Issue a ref for a kref. If the kref already has a ref, return it.
   *
   * @param kref - The kernel reference.
   * @returns The issued ref.
   */
  function issueRef(kref: string): string {
    const existing = krefToRef[kref];
    if (existing) {
      return existing;
    }
    refCounter += 1;
    if (baggage.has('refCounter')) {
      baggage.set('refCounter', refCounter);
    } else {
      baggage.init('refCounter', refCounter);
    }
    const ref = `d-${refCounter}`;
    refs[ref] = kref;
    krefToRef[kref] = ref;
    persistRefs();
    return ref;
  }

  /**
   * Look up the kref for a ref.
   *
   * @param ref - The ref to look up.
   * @returns The kref, or undefined if not found.
   */
  function lookupKref(ref: string): string | undefined {
    return refs[ref];
  }

  /**
   * Revoke a ref, removing it from both maps.
   *
   * @param ref - The ref to revoke.
   * @returns True if the ref was found and revoked.
   */
  function revokeRef(ref: string): boolean {
    const kref = refs[ref];
    if (!kref) {
      return false;
    }
    delete refs[ref];
    delete krefToRef[kref];
    persistRefs();
    return true;
  }

  /**
   * List all issued refs.
   *
   * @returns Array of ref/kref pairs.
   */
  function listRefs(): { ref: string; kref: string }[] {
    return Object.entries(refs).map(([ref, kref]) => ({ ref, kref }));
  }

  /**
   * Get the kernel facet, throwing if not yet bootstrapped.
   *
   * @returns The kernel facet.
   */
  function requireKernelFacet(): KernelFacet {
    if (!kernelFacet) {
      throw new Error('Kernel facet not available (bootstrap not called?)');
    }
    return kernelFacet;
  }

  /**
   * Dispatch a request that has no ref (operates on the system console itself).
   *
   * @param method - The method name.
   * @param args - The method arguments.
   * @returns The response payload.
   */
  async function dispatchConsoleMethod(
    method: string,
    args: unknown[],
  ): Promise<unknown> {
    switch (method) {
      case 'help':
        return {
          commands: [
            'help - show available commands',
            'status - kernel status',
            'launch <config> - launch a subcluster',
            'terminate <subclusterId> - terminate a subcluster',
            'subclusters - list subclusters',
            'revoke <ref> - revoke a ref',
            'listRefs - list all issued refs',
          ],
        };

      case 'status':
        return E(requireKernelFacet()).getStatus();

      case 'subclusters':
        return E(requireKernelFacet()).getSubclusters();

      case 'launch': {
        const config = args[0] as ClusterConfig;
        if (!config) {
          throw new Error('launch requires a config argument');
        }
        const result = await E(requireKernelFacet()).launchSubcluster(config);
        const ref = issueRef(result.rootKref);
        return { ref, subclusterId: result.subclusterId };
      }

      case 'terminate': {
        const subclusterId = args[0] as string;
        if (!subclusterId) {
          throw new Error('terminate requires a subclusterId argument');
        }
        await E(requireKernelFacet()).terminateSubcluster(subclusterId);
        return { ok: true };
      }

      case 'revoke': {
        const ref = args[0] as string;
        if (!ref) {
          throw new Error('revoke requires a ref argument');
        }
        return { ok: revokeRef(ref) };
      }

      case 'listRefs':
        return { refs: listRefs() };

      default:
        throw new Error(`Unknown command: ${method}`);
    }
  }

  /**
   * Handle a single parsed request and return the response.
   *
   * @param request - The parsed request.
   * @returns The response payload.
   */
  async function handleRequest(request: Request): Promise<unknown> {
    const { ref, method, args = [] } = request;

    if (!ref) {
      return dispatchConsoleMethod(method, args);
    }

    // Ref-based dispatch: resolve ref → kref, then queue message
    const kref = lookupKref(ref);
    if (!kref) {
      throw new Error(`Unknown ref: ${ref}`);
    }
    return E(requireKernelFacet()).queueMessage(kref, method, args);
  }

  /**
   * Run the REPL loop: read a JSON line, dispatch, write response, repeat.
   *
   * @param ioService - The IO service to read/write from.
   */
  async function runReplLoop(ioService: IOService): Promise<void> {
    for (;;) {
      const line = await E(ioService).read();
      if (line === null) {
        // Client disconnected — wait for next connection
        continue;
      }

      let response: unknown;
      try {
        const request = JSON.parse(line) as Request;
        const result = await handleRequest(request);
        response = { ok: true, result };
      } catch (error) {
        // Errors crossing vat boundaries may arrive as plain objects.
        // Try multiple strategies to extract a human-readable message.
        let errorMessage: string;
        if (error instanceof Error) {
          errorMessage = error.message ?? error.stack ?? String(error);
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else {
          try {
            errorMessage = JSON.stringify(error);
          } catch {
            errorMessage = String(error);
          }
        }
        response = { ok: false, error: errorMessage };
      }

      try {
        await E(ioService).write(JSON.stringify(response));
      } catch {
        // Write failed (client disconnected mid-response) — continue loop
      }
    }
  }

  return makeDefaultExo('root', {
    /**
     * Bootstrap the vat.
     *
     * @param _vats - The vats object (unused).
     * @param services - The services object containing kernelFacet and console IO.
     */
    async bootstrap(
      _vats: unknown,
      services: BootstrapServices,
    ): Promise<void> {
      if (!kernelFacet && services.kernelFacet) {
        kernelFacet = services.kernelFacet;
        baggage.init('kernelFacet', kernelFacet);
      }

      if (services.console) {
        // Fire-and-forget the REPL loop — it runs indefinitely
        // eslint-disable-next-line no-console -- vat diagnostic output
        runReplLoop(services.console).catch(console.error);
      }
    },

    /**
     * Get help information.
     *
     * @returns The help object.
     */
    help() {
      return harden({
        commands: [
          'help - show available commands',
          'status - kernel status',
          'launch <config> - launch a subcluster',
          'terminate <subclusterId> - terminate a subcluster',
          'subclusters - list subclusters',
          'revoke <ref> - revoke a ref',
          'listRefs - list all issued refs',
        ],
      });
    },

    /**
     * Issue a ref for a kref. Exposed for the daemon to get the initial console ref.
     *
     * @param kref - The kernel reference.
     * @returns The issued ref.
     */
    issueRef(kref: string): string {
      return issueRef(kref);
    },

    /**
     * List all issued refs.
     *
     * @returns Array of ref/kref pairs.
     */
    listRefs(): { ref: string; kref: string }[] {
      return listRefs();
    },
  });
}
