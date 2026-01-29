import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import { Logger } from '@metamask/logger';
import type { DuplexStream } from '@metamask/streams';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { KernelFacet } from '../../src/kernel-facet.ts';
import { Kernel } from '../../src/Kernel.ts';
import type {
  PlatformServices,
  SystemVatBuildRootObject,
  SystemVatTransport,
  SystemVatSyscallHandler,
  SystemVatDeliverFn,
  StaticSystemVatConfig,
} from '../../src/types.ts';
import { SystemVatSupervisor } from '../../src/vats/SystemVatSupervisor.ts';
import { makeMapKernelDatabase } from '../storage.ts';

/**
 * Result of creating a test system vat.
 */
type TestSystemVatResult = {
  /** Config for kernel. */
  config: StaticSystemVatConfig;
  /** Call after Kernel.make() to initiate connection from supervisor side. */
  connect: () => void;
  /** Promise that resolves to kernelFacet when bootstrap completes. */
  kernelFacetPromise: Promise<KernelFacet>;
};

/**
 * Create a system vat transport and supervisor pair for testing.
 * Uses the push-based connection pattern where the supervisor initiates
 * connection after the kernel is created.
 *
 * @param options - Options for creating the transport.
 * @param options.logger - Logger instance.
 * @param options.name - Name for the system vat.
 * @returns The config, connect function, and kernelFacetPromise.
 */
function makeTestSystemVat(options: {
  logger: Logger;
  name?: string;
}): TestSystemVatResult {
  const { logger, name = 'testVat' } = options;

  // Promise kit for kernel facet - resolves when bootstrap is called
  const kernelFacetKit = makePromiseKit<KernelFacet>();

  // Syscall handler - set by kernel during prepareStaticSystemVat()
  let syscallHandler: SystemVatSyscallHandler | null = null;

  // Build root object that captures kernelFacet from bootstrap
  const buildRootObject: SystemVatBuildRootObject = () => {
    return makeDefaultExo('TestRoot', {
      bootstrap: (
        _roots: Record<string, unknown>,
        services: { kernelFacet: KernelFacet },
      ) => {
        kernelFacetKit.resolve(services.kernelFacet);
      },
    });
  };

  // Promise kit to signal when supervisor is ready
  const supervisorReady = makePromiseKit<SystemVatSupervisor>();

  // Promise kit for connection - resolved when connect() is called
  const connectionKit = makePromiseKit<void>();

  // Create the transport with a deliver function that waits for the supervisor
  const deliver: SystemVatDeliverFn = async (delivery) => {
    const supervisor = await supervisorReady.promise;
    return supervisor.deliver(delivery);
  };

  const transport: SystemVatTransport = {
    deliver,
    setSyscallHandler: (handler: SystemVatSyscallHandler) => {
      syscallHandler = handler;
    },
    awaitConnection: async () => connectionKit.promise,
  };

  // Called after Kernel.make() to initiate connection from supervisor side
  const connect = (): void => {
    if (!syscallHandler) {
      throw new Error('Syscall handler not set');
    }
    SystemVatSupervisor.make({
      buildRootObject,
      executeSyscall: syscallHandler,
      logger: logger.subLogger({ tags: ['supervisor'] }),
    })
      .then((supervisor) => {
        supervisorReady.resolve(supervisor);
        connectionKit.resolve();
        return undefined;
      })
      .catch((error) => {
        connectionKit.reject(error as Error);
        kernelFacetKit.reject(error as Error);
      });
  };

  const config: StaticSystemVatConfig = {
    name,
    transport,
  };

  return { config, connect, kernelFacetPromise: kernelFacetKit.promise };
}

describe('system vat integration', { timeout: 30_000 }, () => {
  let kernel: Kernel;
  let kernelFacet: KernelFacet | Promise<KernelFacet>;

  beforeEach(async () => {
    const logger = new Logger('test');

    // Create the system vat transport
    const systemVat = makeTestSystemVat({
      logger: logger.subLogger({ tags: ['system-vat'] }),
    });

    // Create mock platform services
    const mockPlatformServices: PlatformServices = {
      launch: vi.fn().mockResolvedValue({
        end: vi.fn(),
      } as unknown as DuplexStream<JsonRpcMessage, JsonRpcMessage>),
      terminate: vi.fn().mockResolvedValue(undefined),
      terminateAll: vi.fn().mockResolvedValue(undefined),
      stopRemoteComms: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlatformServices;

    // Create kernel with system vat config
    const kernelDatabase = makeMapKernelDatabase();
    kernel = await Kernel.make(mockPlatformServices, kernelDatabase, {
      resetStorage: true,
      logger: logger.subLogger({ tags: ['kernel'] }),
      systemVats: { vats: [systemVat.config] },
    });

    // Supervisor-side initiates connection AFTER kernel exists
    systemVat.connect();

    // Wait for kernel facet
    kernelFacet = await systemVat.kernelFacetPromise;
  });

  afterEach(async () => {
    await kernel.clearStorage();
  });

  describe('kernel facet', () => {
    it('gets kernel status via E()', async () => {
      const status = await E(kernelFacet).getStatus();

      expect(status).toBeDefined();
      expect(status.vats).toBeDefined();
      expect(status.subclusters).toBeDefined();
      expect(status.remoteComms).toBeDefined();
    });

    it('gets subclusters via E()', async () => {
      const subclusters = await E(kernelFacet).getSubclusters();

      expect(subclusters).toBeDefined();
      expect(Array.isArray(subclusters)).toBe(true);
    });
  });
});
