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
 * Create a system vat transport and supervisor pair for testing.
 * Uses a deferred pattern to handle the timing between kernel creation
 * and supervisor startup.
 *
 * @param options - Options for creating the transport.
 * @param options.buildRootObject - Function to build the root object.
 * @param options.logger - Logger instance.
 * @returns The transport config and start function.
 */
function makeTestSystemVat(options: {
  buildRootObject: SystemVatBuildRootObject;
  logger: Logger;
}): {
  transport: SystemVatTransport;
  start: () => Promise<void>;
} {
  const { buildRootObject, logger } = options;

  // Create syscall handler holder for deferred wiring
  const syscallHandlerHolder = makeSyscallHandlerHolder();

  // Promise kit to signal when supervisor is ready
  const supervisorReady = makePromiseKit<SystemVatSupervisor>();

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
  };

  const start = async () => {
    const supervisor = new SystemVatSupervisor({
      id: 'sv-test' as `sv${number}`,
      buildRootObject,
      vatPowers: {},
      parameters: undefined,
      syscallHandlerHolder,
      logger: logger.subLogger({ tags: ['supervisor'] }),
    });

    await supervisor.start();

    // Signal that the supervisor is ready
    supervisorReady.resolve(supervisor);
  };

  return { transport, start };
}

describe('system vat integration', { timeout: 30_000 }, () => {
  let kernel: Kernel;
  let kernelFacet: KernelFacet;

  beforeEach(async () => {
    const logger = new Logger('test');

    // Captured kernel facet from bootstrap
    let capturedKernelFacet: KernelFacet | null = null;

    // Build root object that captures the kernel facet from services
    const buildRootObject: SystemVatBuildRootObject = () => {
      return makeDefaultExo('TestRoot', {
        bootstrap: (
          _roots: Record<string, unknown>,
          services: { kernelFacet: KernelFacet },
        ) => {
          capturedKernelFacet = services.kernelFacet;
        },
      });
    };

    // Create the system vat transport and supervisor
    const systemVat = makeTestSystemVat({
      buildRootObject,
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

    // Start the supervisor - this unblocks the deliver function
    await systemVat.start();

    // Wait for the bootstrap message to be delivered and processed
    await vi.waitFor(
      () => {
        if (!capturedKernelFacet) {
          throw new Error('Waiting for kernel facet...');
        }
      },
      { timeout: 5000, interval: 50 },
    );

    kernelFacet = capturedKernelFacet!;
  });

  afterEach(async () => {
    await kernel.clearStorage();
  });

  describe('kernel facet', () => {
    it.todo('gets kernel status via E()', async () => {
      // TODO: Need to make getStatus stop waiting for crank
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
