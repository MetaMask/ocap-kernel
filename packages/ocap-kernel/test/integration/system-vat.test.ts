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
} from '../../src/types.ts';
import {
  SystemVatSupervisor,
  makeSyscallHandlerHolder,
} from '../../src/vats/SystemVatSupervisor.ts';
import { makeMapKernelDatabase } from '../storage.ts';

/**
 * Result of creating a test system vat.
 */
type TestSystemVatResult = {
  /** Transport config for kernel. */
  transport: SystemVatTransport;
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
 * @returns The transport config, connect function, and kernelFacetPromise.
 */
function makeTestSystemVat(options: { logger: Logger }): TestSystemVatResult {
  const { logger } = options;

  // Promise kit for kernel facet - resolves when bootstrap is called
  const kernelFacetKit = makePromiseKit<KernelFacet>();

  // Create syscall handler holder for deferred wiring
  const syscallHandlerHolder = makeSyscallHandlerHolder();

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
      syscallHandlerHolder.handler = handler;
    },
    awaitConnection: async () => connectionKit.promise,
  };

  // Called after Kernel.make() to initiate connection from supervisor side
  const connect = (): void => {
    SystemVatSupervisor.make({
      buildRootObject,
      syscallHandlerHolder,
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

  return { transport, connect, kernelFacetPromise: kernelFacetKit.promise };
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

    // Create kernel with system subcluster config
    const kernelDatabase = makeMapKernelDatabase();
    kernel = await Kernel.make(mockPlatformServices, kernelDatabase, {
      resetStorage: true,
      logger: logger.subLogger({ tags: ['kernel'] }),
      systemSubclusters: {
        subclusters: [
          {
            bootstrap: 'testVat',
            vatTransports: [
              {
                name: 'testVat',
                transport: systemVat.transport,
              },
            ],
          },
        ],
      },
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
