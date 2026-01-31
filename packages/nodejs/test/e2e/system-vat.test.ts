import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { Logger } from '@metamask/logger';
import type { ClusterConfig, KernelFacet } from '@metamask/ocap-kernel';
import { Kernel } from '@metamask/ocap-kernel';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeHostVat } from '../../src/host-vat/index.ts';
import { NodejsPlatformServices } from '../../src/kernel/PlatformServices.ts';

type Bob = {
  makeGreeter: (greeting: string) => Promise<Greeter>;
};
type Carol = {
  receiveAndGreet: (greeter: Greeter, name: string) => Promise<string>;
};
type Greeter = {
  greet: (name: string) => Promise<string>;
};

type PromiseVat = {
  makeGreeter: (greeting: string) => Promise<Greeter>;
  makeDeferredPromise: () => Promise<unknown>;
  resolveDeferredPromise: (value: unknown) => void;
  rejectDeferredPromise: (reason: string) => void;
  getRejectingPromise: (reason: string) => Promise<never>;
  awaitPromiseArg: (promiseArg: Promise<unknown>) => Promise<string>;
};

describe('system vat e2e tests', { timeout: 30_000 }, () => {
  let kernel: Kernel;
  let kernelFacet: KernelFacet | Promise<KernelFacet>;

  beforeEach(async () => {
    const logger = new Logger('test');

    // Create host vat first
    const hostVat = makeHostVat({ logger });

    // Create kernel with system vat config
    const platformServices = new NodejsPlatformServices({
      logger: logger.subLogger({ tags: ['platform-services'] }),
    });
    const kernelDatabase = await makeSQLKernelDatabase({});

    // Import Kernel dynamically to avoid circular deps
    kernel = await Kernel.make(platformServices, kernelDatabase, {
      resetStorage: true,
      logger: logger.subLogger({ tags: ['kernel'] }),
      hostVat: hostVat.config,
    });

    // Supervisor-side initiates connection AFTER kernel exists
    hostVat.connect();

    // Wait for kernel facet - resolves after bootstrap message is delivered
    kernelFacet = await hostVat.kernelFacetPromise;
  });

  afterEach(async () => {
    await kernel.clearStorage();
  });

  describe('basic operations', () => {
    it('gets kernel status', async () => {
      const status = await E(kernelFacet).getStatus();
      expect(status).toBeDefined();
      expect(status.vats).toBeDefined();
      expect(status.subclusters).toBeDefined();
    });

    it('launches a subcluster and receives E()-callable presence', async () => {
      const config: ClusterConfig = {
        bootstrap: 'bob',
        vats: {
          bob: {
            bundleSpec: 'http://localhost:3000/bob-vat.bundle',
          },
        },
      };

      const result = await E(kernelFacet).launchSubcluster(config);

      expect(result.subclusterId).toBeDefined();
      expect(result.root).toBeDefined();
      expect(result.rootKref).toBeDefined();

      // The root should be E()-callable
      const bob = result.root as unknown as Bob;
      const greeter = await E(bob).makeGreeter('Hello');
      expect(greeter).toBeDefined();
    });

    it('terminates a subcluster', async () => {
      const config: ClusterConfig = {
        bootstrap: 'bob',
        vats: {
          bob: {
            bundleSpec: 'http://localhost:3000/bob-vat.bundle',
          },
        },
      };

      const result = await E(kernelFacet).launchSubcluster(config);
      const subcluster = await E(kernelFacet).getSubcluster(
        result.subclusterId,
      );
      expect(subcluster).toBeDefined();

      await E(kernelFacet).terminateSubcluster(result.subclusterId);

      const terminatedSubcluster = await E(kernelFacet).getSubcluster(
        result.subclusterId,
      );
      expect(terminatedSubcluster).toBeUndefined();
    });
  });

  describe('third-party handoff', () => {
    it('host orchestrates handoff between two vats', async () => {
      // Launch Bob and Carol in the same subcluster
      const config: ClusterConfig = {
        bootstrap: 'bob',
        vats: {
          bob: {
            bundleSpec: 'http://localhost:3000/bob-vat.bundle',
          },
          carol: {
            bundleSpec: 'http://localhost:3000/carol-vat.bundle',
          },
        },
      };

      const launchResult = await E(kernelFacet).launchSubcluster(config);
      const bob = launchResult.root as unknown as Bob;

      // Get Carol's root object
      const subcluster = await E(kernelFacet).getSubcluster(
        launchResult.subclusterId,
      );
      expect(subcluster).toBeDefined();
      const carolVatId = subcluster?.vats.find(
        (vatId) => vatId !== subcluster.vats[0],
      );
      expect(carolVatId).toBeDefined();
      const carolKref = kernel.pinVatRoot(carolVatId!);
      const carol = (await E(kernelFacet).getVatRoot(carolKref)) as Carol;

      // Host orchestrates: get exo from Bob, pass to Carol
      const greeter = await E(bob).makeGreeter('Greetings');
      const result = await E(carol).receiveAndGreet(greeter, 'Universe');

      expect(result).toBe('Greetings, Universe!');
    });

    it('host passes presence between two separate subclusters', async () => {
      // Launch Bob in one subcluster
      const bobConfig: ClusterConfig = {
        bootstrap: 'bob',
        vats: {
          bob: {
            bundleSpec: 'http://localhost:3000/bob-vat.bundle',
          },
        },
      };
      const bobResult = await E(kernelFacet).launchSubcluster(bobConfig);
      const bob = bobResult.root as unknown as Bob;

      // Launch Carol in another subcluster
      const carolConfig: ClusterConfig = {
        bootstrap: 'carol',
        vats: {
          carol: {
            bundleSpec: 'http://localhost:3000/carol-vat.bundle',
          },
        },
      };
      const carolResult = await E(kernelFacet).launchSubcluster(carolConfig);
      const carol = carolResult.root as unknown as Carol;

      // Host orchestrates cross-subcluster handoff
      const greeter = await E(bob).makeGreeter('Cross-cluster');
      const result = await E(carol).receiveAndGreet(greeter, 'Test');

      expect(result).toBe('Cross-cluster, Test!');
    });
  });

  describe('promise handling', () => {
    it('supports promise pipelining (E() on unresolved promise)', async () => {
      const config: ClusterConfig = {
        bootstrap: 'promiseVat',
        vats: {
          promiseVat: {
            bundleSpec: 'http://localhost:3000/promise-vat.bundle',
          },
        },
      };

      const result = await E(kernelFacet).launchSubcluster(config);
      const promiseVat = result.root as unknown as PromiseVat;

      // Get a promise for an exo (without awaiting)
      const exoPromise = E(promiseVat).makeGreeter('Hi');

      // Pipeline: call method on the unresolved promise
      const greetingPromise = E(exoPromise).greet('World');

      // Both should resolve correctly
      const greeting = await greetingPromise;
      expect(greeting).toBe('Hi, World!');
    });

    it('handles deferred promise resolution', async () => {
      const config: ClusterConfig = {
        bootstrap: 'promiseVat',
        vats: {
          promiseVat: {
            bundleSpec: 'http://localhost:3000/promise-vat.bundle',
          },
        },
      };

      const result = await E(kernelFacet).launchSubcluster(config);
      const promiseVat = result.root as unknown as PromiseVat;

      // Get a deferred promise (unresolved)
      const deferredPromise = E(promiseVat).makeDeferredPromise();

      // Resolve it
      await E(promiseVat).resolveDeferredPromise('resolved value');

      // The deferred promise should now resolve
      const resolvedValue = await deferredPromise;
      expect(resolvedValue).toBe('resolved value');
    });

    it('handles deferred promise rejection', async () => {
      const config: ClusterConfig = {
        bootstrap: 'promiseVat',
        vats: {
          promiseVat: {
            bundleSpec: 'http://localhost:3000/promise-vat.bundle',
          },
        },
      };

      const result = await E(kernelFacet).launchSubcluster(config);
      const promiseVat = result.root as unknown as PromiseVat;

      // Get a deferred promise (unresolved)
      const deferredPromise = E(promiseVat).makeDeferredPromise();

      // Reject it
      await E(promiseVat).rejectDeferredPromise('error reason');

      // Rejections from vats throw errors
      await expect(deferredPromise).rejects.toThrow('error reason');
    });

    it('vat awaits promise created in host vat', async () => {
      const config: ClusterConfig = {
        bootstrap: 'promiseVat',
        vats: {
          promiseVat: {
            bundleSpec: 'http://localhost:3000/promise-vat.bundle',
          },
        },
      };

      const result = await E(kernelFacet).launchSubcluster(config);
      const promiseVat = result.root as unknown as PromiseVat;

      // Create a deferred promise in the host vat (this test)
      const { promise, resolve } = makePromiseKit<unknown>();

      // Pass the unresolved promise to the vat
      const resultPromise = E(promiseVat).awaitPromiseArg(promise);

      // Resolve the deferred promise from the host vat
      resolve('host-resolved-value');

      // The vat should receive the resolved value
      const vatResult = await resultPromise;
      expect(vatResult).toBe('received: host-resolved-value');
    });
  });

  describe('kref to presence restoration', () => {
    it('converts stored kref back to E()-callable presence', async () => {
      const config: ClusterConfig = {
        bootstrap: 'bob',
        vats: {
          bob: {
            bundleSpec: 'http://localhost:3000/bob-vat.bundle',
          },
        },
      };

      // Launch and get rootKref for storage
      const result = await E(kernelFacet).launchSubcluster(config);
      const storedKref = result.rootKref;

      // Later: restore presence from kref
      const restoredBob = (await E(kernelFacet).getVatRoot(storedKref)) as Bob;

      // The restored presence should be E()-callable
      const greeter = await E(restoredBob).makeGreeter('Restored');
      const greeting = await E(greeter).greet('World');
      expect(greeting).toBe('Restored, World!');
    });
  });
});
