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
  invokeMethod: (
    target: string,
    method: string,
    args: unknown[],
  ) => Promise<unknown>;
  launchSubcluster: (config: ClusterConfig) => Promise<SubclusterLaunchResult>;
  terminateSubcluster: (subclusterId: string) => Promise<void>;
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
  /**
   * Get a value from baggage, or return a fallback if the key is absent.
   *
   * @param key - The baggage key.
   * @param fallback - The value to return if the key is absent.
   * @returns The stored value or the fallback.
   */
  function baggageGet<T>(key: string, fallback: T): T {
    return baggage.has(key) ? (baggage.get(key) as T) : fallback;
  }

  /**
   * Set a value in baggage, initialising the key if it doesn't exist.
   *
   * @param key - The baggage key.
   * @param value - The value to store.
   */
  function baggagePut(key: string, value: unknown): void {
    if (baggage.has(key)) {
      baggage.set(key, value);
    } else {
      baggage.init(key, value);
    }
  }

  // Monotonic counter for generating unique ref identifiers (persisted in baggage)
  let refCounter: number = baggageGet('refCounter', 0);
  // Restore kernel facet from baggage if available (for resuscitation)
  let kernelFacet: KernelFacet | undefined = baggageGet<
    KernelFacet | undefined
  >('kernelFacet', undefined);

  // Track which kref is the root's own, so isSelf-ref dispatch avoids kernel round-trip
  let selfKref: string | undefined = baggageGet<string | undefined>(
    'selfKref',
    undefined,
  );

  // Ref manager state in baggage: ref → kref and kref → ref maps
  // Stored as plain objects since baggage serializes them
  const refs: Record<string, string> = baggageGet(
    'refs',
    {} as Record<string, string>,
  );
  const krefToRef: Record<string, string> = baggageGet(
    'krefToRef',
    {} as Record<string, string>,
  );

  /**
   * Persist the current ref state to baggage.
   */
  function persistRefs(): void {
    baggagePut('refs', harden({ ...refs }));
    baggagePut('krefToRef', harden({ ...krefToRef }));
  }

  /**
   * Issue a ref for a kref. If the kref already has a ref, return it.
   *
   * @param kref - The kernel reference.
   * @param isSelf - If true, marks this kref as the root's own for direct dispatch.
   * @returns The issued ref.
   */
  function issueRef(kref: string, isSelf?: boolean): string {
    if (isSelf) {
      selfKref = kref;
      baggagePut('selfKref', selfKref);
    }
    const existing = krefToRef[kref];
    if (existing) {
      return existing;
    }
    refCounter += 1;
    baggagePut('refCounter', refCounter);
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
   * Dispatch a method call on the root exo directly, bypassing the kernel.
   *
   * @param method - The method name.
   * @param args - The method arguments.
   * @returns The result of the method call.
   */
  function dispatchOnSelf(method: string, args: unknown[]): unknown {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const fn = root[method as keyof typeof root] as
      | ((...a: unknown[]) => unknown)
      | undefined;
    if (typeof fn !== 'function') {
      throw new Error(`Unknown method on root: ${method}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return fn.call(root, ...args);
  }

  /**
   * Dispatch a request that has no ref (daemon-tier commands only).
   *
   * Only basic liveness commands are available without a capability ref.
   * Privileged operations require a ref obtained from the `.ocap` file.
   *
   * @param method - The method name.
   * @param _args - The method arguments (unused for daemon-tier commands).
   * @returns The response payload.
   */
  async function dispatchConsoleMethod(
    method: string,
    _args: unknown[],
  ): Promise<unknown> {
    switch (method) {
      case 'help':
        return {
          commands: [
            'help - show available commands',
            'status - daemon status',
          ],
        };

      case 'status':
        return { running: true };

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

    // Ref-based dispatch: resolve ref → kref
    const kref = lookupKref(ref);
    if (!kref) {
      throw new Error(`Unknown ref: ${ref}`);
    }

    // Self-ref: dispatch directly to avoid kernel round-trip
    if (kref === selfKref) {
      return dispatchOnSelf(method, args);
    }

    // External ref: dispatch through the kernel's message queue
    return E(requireKernelFacet()).invokeMethod(kref, method, args);
  }

  /**
   * Validate and coerce a parsed JSON value into a {@link Request}.
   *
   * @param parsed - The raw parsed JSON value.
   * @returns The validated request.
   */
  function validateRequest(parsed: unknown): Request {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Request must be a JSON object');
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.method !== 'string') {
      throw new Error('Request must have a string "method" field');
    }
    if (obj.ref !== undefined && typeof obj.ref !== 'string') {
      throw new Error('"ref" must be a string');
    }
    if (obj.args !== undefined && !Array.isArray(obj.args)) {
      throw new Error('"args" must be an array');
    }
    return {
      method: obj.method,
      ...(typeof obj.ref === 'string' ? { ref: obj.ref } : {}),
      ...(Array.isArray(obj.args) ? { args: obj.args as unknown[] } : {}),
    };
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
        const request = validateRequest(JSON.parse(line));
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

  const root = makeDefaultExo('root', {
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
        baggagePut('kernelFacet', kernelFacet);
      }

      if (services.console) {
        // Fire-and-forget the REPL loop — it runs indefinitely
        // eslint-disable-next-line no-console -- vat diagnostic output
        runReplLoop(services.console).catch(console.error);
      }
    },

    /**
     * Issue a ref for a kref. Exposed for the daemon to get the initial console ref.
     *
     * @param kref - The kernel reference.
     * @param isSelf - If true, marks this kref as the root's own for direct dispatch.
     * @returns The issued ref.
     */
    issueRef(kref: string, isSelf?: boolean): string {
      return issueRef(kref, isSelf);
    },

    /**
     * Get help information (privileged — lists all available commands).
     *
     * @returns The help object.
     */
    help() {
      return harden({
        commands: [
          'help - show available commands',
          'status - kernel status',
          'subclusters - list subclusters',
          'launch <config> - launch a subcluster',
          'terminate <subclusterId> - terminate a subcluster',
          'ls - list all issued refs',
          'revoke <ref> - revoke a ref',
          'invoke <ref> <method> [...args] - call a method on a ref',
        ],
      });
    },

    /**
     * Get kernel status.
     *
     * @returns The kernel status.
     */
    async status(): Promise<KernelStatus> {
      return E(requireKernelFacet()).getStatus();
    },

    /**
     * List subclusters.
     *
     * @returns The subclusters.
     */
    async subclusters(): Promise<Subcluster[]> {
      return E(requireKernelFacet()).getSubclusters();
    },

    /**
     * Launch a subcluster and issue a ref for its root object.
     *
     * @param config - The cluster config.
     * @returns The issued ref and subcluster ID.
     */
    async launch(
      config: ClusterConfig,
    ): Promise<{ ref: string; subclusterId: string }> {
      if (!config) {
        throw new Error('launch requires a config argument');
      }
      const result = await E(requireKernelFacet()).launchSubcluster(config);
      const ref = issueRef(result.rootKref);
      return harden({ ref, subclusterId: result.subclusterId });
    },

    /**
     * Terminate a subcluster.
     *
     * @param subclusterId - The subcluster ID.
     * @returns Confirmation.
     */
    async terminate(subclusterId: string): Promise<{ ok: true }> {
      if (!subclusterId) {
        throw new Error('terminate requires a subclusterId argument');
      }
      await E(requireKernelFacet()).terminateSubcluster(subclusterId);
      return harden({ ok: true as const });
    },

    /**
     * Revoke a ref.
     *
     * @param ref - The ref to revoke.
     * @returns Whether the ref was found and revoked.
     */
    revoke(ref: string): { ok: boolean } {
      if (!ref) {
        throw new Error('revoke requires a ref argument');
      }
      return harden({ ok: revokeRef(ref) });
    },

    /**
     * List all issued refs.
     *
     * @returns Array of ref strings.
     */
    ls(): { refs: string[] } {
      return harden({ refs: listRefs().map((entry) => entry.ref) });
    },

    /**
     * Invoke a method on a target ref, forwarding pure-data arguments
     * through the kernel.
     *
     * @param targetRef - The ref to invoke the method on.
     * @param method - The method name.
     * @param args - The method arguments.
     * @returns The result of the method call.
     */
    async invoke(
      targetRef: string,
      method: string,
      ...args: unknown[]
    ): Promise<unknown> {
      if (!targetRef) {
        throw new Error('invoke requires a target ref');
      }
      if (!method) {
        throw new Error('invoke requires a method name');
      }
      const kref = lookupKref(targetRef);
      if (!kref) {
        throw new Error(`Unknown ref: ${targetRef}`);
      }
      // Self-ref: dispatch directly to avoid kernel round-trip
      if (kref === selfKref) {
        return dispatchOnSelf(method, args);
      }
      return E(requireKernelFacet()).invokeMethod(kref, method, args);
    },
  });

  return root;
}
