import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type {
  Baggage,
  ClusterConfig,
  KernelStatus,
  Subcluster,
  SubclusterLaunchResult,
} from '@metamask/ocap-kernel';

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
 * @param parameters - The vat parameters.
 * @param parameters.name - Optional name for the console vat.
 * @param baggage - The vat's persistent baggage storage.
 * @returns The root object for the new vat.
 */
export function buildRootObject(
  _vatPowers: unknown,
  parameters: { name?: string },
  baggage: Baggage,
) {
  const name = parameters.name ?? 'system-console';

  // Monotonic counter for generating unique ref identifiers (persisted in baggage)
  let refCounter: number = baggage.has('refCounter')
    ? (baggage.get('refCounter') as number)
    : 0;

  // Restore kernel facet from baggage if available (for resuscitation)
  let kernelFacet: KernelFacet | undefined = baggage.has('kernelFacet')
    ? (baggage.get('kernelFacet') as KernelFacet)
    : undefined;

  // Ref manager state in baggage
  const refs: Record<string, string> = baggage.has('refs')
    ? (baggage.get('refs') as Record<string, string>)
    : {};
  const krefToRef: Record<string, string> = baggage.has('krefToRef')
    ? (baggage.get('krefToRef') as Record<string, string>)
    : {};

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

  function lookupKref(ref: string): string | undefined {
    return refs[ref];
  }

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

  function listRefs(): { ref: string; kref: string }[] {
    return Object.entries(refs).map(([ref, kref]) => ({ ref, kref }));
  }

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
        return E(kernelFacet!).getStatus();

      case 'subclusters':
        return E(kernelFacet!).getSubclusters();

      case 'launch': {
        const config = args[0] as ClusterConfig;
        if (!config) {
          throw new Error('launch requires a config argument');
        }
        const result = await E(kernelFacet!).launchSubcluster(config);
        const ref = issueRef(result.rootKref);
        return { ref, subclusterId: result.subclusterId };
      }

      case 'terminate': {
        const subclusterId = args[0] as string;
        if (!subclusterId) {
          throw new Error('terminate requires a subclusterId argument');
        }
        await E(kernelFacet!).terminateSubcluster(subclusterId);
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

  async function handleRequest(request: Request): Promise<unknown> {
    const { ref, method, args = [] } = request;

    if (!ref) {
      return dispatchConsoleMethod(method, args);
    }

    const kref = lookupKref(ref);
    if (!kref) {
      throw new Error(`Unknown ref: ${ref}`);
    }
    return E(kernelFacet!).queueMessage(kref, method, args);
  }

  async function runReplLoop(ioService: IOService): Promise<void> {
    for (;;) {
      const line = await E(ioService).read();
      if (line === null) {
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
        // Write failed — continue loop
      }
    }
  }

  return makeDefaultExo('root', {
    async bootstrap(
      _vats: unknown,
      services: BootstrapServices,
    ): Promise<void> {
      if (!kernelFacet && services.kernelFacet) {
        kernelFacet = services.kernelFacet;
        baggage.init('kernelFacet', kernelFacet);
      }

      if (services.console) {
        runReplLoop(services.console).catch((error) => {
          console.error(`[${name}] REPL loop error:`, error);
        });
      }
    },

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

    issueRef(kref: string): string {
      return issueRef(kref);
    },

    listRefs(): { ref: string; kref: string }[] {
      return listRefs();
    },
  });
}
