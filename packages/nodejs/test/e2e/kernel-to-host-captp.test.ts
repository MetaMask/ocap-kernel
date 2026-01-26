import { E } from '@endo/eventual-send';
import type { Kernel, ClusterConfig, KRef, VatId } from '@metamask/ocap-kernel';
import { makePresenceManager } from '@metamask/ocap-kernel';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeKernel } from '../../src/kernel/make-kernel.ts';

type Alice = {
  performHandoff: (
    bob: Bob,
    carol: Carol,
    greeting: string,
    name: string,
  ) => Promise<string>;
};
type Bob = {
  makeGreeter: (greeting: string) => Promise<Greeter>;
};
type Carol = {
  receiveAndGreet: (greeter: Greeter, name: string) => Promise<string>;
  storeExo: (exo: unknown) => Promise<string>;
  useStoredExo: (name: string) => Promise<string>;
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
  awaitDeferredFromVat: (promiserVat: PromiseVat) => Promise<string>;
};

/**
 * Creates a map from vat names to their root krefs for a given subcluster.
 *
 * @param kernel - The kernel instance.
 * @param subclusterId - The subcluster ID.
 * @returns A record mapping vat names to their root krefs.
 */
function getVatRootKrefs(
  kernel: Kernel,
  subclusterId: string,
): Record<string, KRef> {
  const subcluster = kernel.getSubcluster(subclusterId);
  if (!subcluster) {
    throw new Error(`Subcluster ${subclusterId} not found`);
  }

  const vatNames = Object.keys(subcluster.config.vats);
  const vatIds: VatId[] = subcluster.vats;

  const result: Record<string, KRef> = {};
  for (let i = 0; i < vatNames.length; i++) {
    const vatName = vatNames[i];
    assert(vatName, `Vat name is undefined`);
    const vatId = vatIds[i];
    assert(vatId, `Vat ID for ${vatName} is undefined`);
    result[vatName] = kernel.pinVatRoot(vatId);
  }
  return result;
}

describe('third-party handoff', { timeout: 15_000 }, () => {
  let kernel: Kernel;

  beforeEach(async () => {
    kernel = await makeKernel({});
  });

  afterEach(async () => {
    await kernel.clearStorage();
  });

  it('alice passes exo from Bob to Carol (vat-internal handoff)', async () => {
    // Launch subcluster with Alice, Bob, Carol
    const config: ClusterConfig = {
      bootstrap: 'alice',
      vats: {
        alice: {
          bundleSpec: 'http://localhost:3000/alice-vat.bundle',
        },
        bob: {
          bundleSpec: 'http://localhost:3000/bob-vat.bundle',
        },
        carol: {
          bundleSpec: 'http://localhost:3000/carol-vat.bundle',
        },
      },
    };

    const { subclusterId, bootstrapRootKref } =
      await kernel.launchSubcluster(config);

    // Create presence manager for E() calls
    const presenceManager = makePresenceManager({ kernel });

    // Get presences for each vat root
    const alice = presenceManager.resolveKref(bootstrapRootKref) as Alice;

    // Get Bob and Carol krefs using the subcluster
    const vatRootKrefs = getVatRootKrefs(kernel, subclusterId);
    const bob = presenceManager.resolveKref(vatRootKrefs.bob as string) as Bob;
    const carol = presenceManager.resolveKref(
      vatRootKrefs.carol as string,
    ) as Carol;

    // Test: Alice orchestrates the third-party handoff
    // Alice calls Bob to get a greeter, then passes it to Carol
    const result = await E(alice).performHandoff(bob, carol, 'Hello', 'World');
    expect(result).toBe('Hello, World!');
  });

  it('external orchestration of third-party handoff', async () => {
    // Launch subcluster with Bob and Carol only
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

    const { subclusterId, bootstrapRootKref } =
      await kernel.launchSubcluster(config);

    // Create presence manager for E() calls
    const presenceManager = makePresenceManager({ kernel });

    // Get presences
    const bob = presenceManager.resolveKref(bootstrapRootKref) as Bob;
    const vatRootKrefs = getVatRootKrefs(kernel, subclusterId);
    const carol = presenceManager.resolveKref(
      vatRootKrefs.carol as string,
    ) as Carol;

    // Test: External code orchestrates the handoff
    // 1. Get exo from Bob
    const greeter = await E(bob).makeGreeter('Greetings');

    // 2. Pass exo to Carol (third-party handoff)
    const greeting = await E(carol).receiveAndGreet(greeter, 'Universe');
    expect(greeting).toBe('Greetings, Universe!');
  });

  it('carol stores exo from Bob in memory and later uses it', async () => {
    // Launch subcluster with Bob and Carol
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

    const { subclusterId } = await kernel.launchSubcluster(config);

    const presenceManager = makePresenceManager({ kernel });

    // Get presences using the subcluster
    const vatRootKrefs = getVatRootKrefs(kernel, subclusterId);
    const bob = presenceManager.resolveKref(vatRootKrefs.bob as string) as Bob;
    const carol = presenceManager.resolveKref(
      vatRootKrefs.carol as string,
    ) as Carol;

    // 1. Get exo from Bob
    const greeter = await E(bob).makeGreeter('Howdy');

    // 2. Carol stores the exo in memory
    const storeResult = await E(carol).storeExo(greeter);
    expect(storeResult).toBe('stored');

    // 3. Carol uses the stored exo later
    const greeting = await E(carol).useStoredExo('Partner');
    expect(greeting).toBe('Howdy, Partner!');
  });
});

describe('kernel promise handling', { timeout: 15_000 }, () => {
  let kernel: Kernel;

  beforeEach(async () => {
    kernel = await makeKernel({});
  });

  afterEach(async () => {
    await kernel.clearStorage();
  });

  it('propagates promise rejection to host', async () => {
    const config: ClusterConfig = {
      bootstrap: 'promiseVat',
      vats: {
        promiseVat: {
          bundleSpec: 'http://localhost:3000/promise-vat.bundle',
        },
      },
    };

    const { bootstrapRootKref } = await kernel.launchSubcluster(config);
    const presenceManager = makePresenceManager({ kernel });
    const promiseVat = presenceManager.resolveKref(
      bootstrapRootKref,
    ) as PromiseVat;

    // Rejections from vats are delivered as Error objects
    const result = await E(promiseVat).getRejectingPromise('test error');
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('test error');
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

    const { bootstrapRootKref } = await kernel.launchSubcluster(config);
    const presenceManager = makePresenceManager({ kernel });
    const promiseVat = presenceManager.resolveKref(
      bootstrapRootKref,
    ) as PromiseVat;

    // Get a deferred promise (unresolved)
    const deferredPromise = E(promiseVat).makeDeferredPromise();

    // Resolve it
    await E(promiseVat).resolveDeferredPromise('resolved value');

    // The deferred promise should now resolve
    const result = await deferredPromise;
    expect(result).toBe('resolved value');
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

    const { bootstrapRootKref } = await kernel.launchSubcluster(config);
    const presenceManager = makePresenceManager({ kernel });
    const promiseVat = presenceManager.resolveKref(
      bootstrapRootKref,
    ) as PromiseVat;

    // Get a deferred promise (unresolved)
    const deferredPromise = E(promiseVat).makeDeferredPromise();

    // Reject it
    await E(promiseVat).rejectDeferredPromise('error reason');

    // Rejections from vats are delivered as Error objects
    const result = await deferredPromise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('error reason');
  });

  it('supports promise pipelining (E() on unresolved promise)', async () => {
    const config: ClusterConfig = {
      bootstrap: 'promiseVat',
      vats: {
        promiseVat: {
          bundleSpec: 'http://localhost:3000/promise-vat.bundle',
        },
      },
    };

    const { bootstrapRootKref } = await kernel.launchSubcluster(config);
    const presenceManager = makePresenceManager({ kernel });
    const promiseVat = presenceManager.resolveKref(
      bootstrapRootKref,
    ) as PromiseVat;

    // Get a promise for an exo (without awaiting)
    const exoPromise = E(promiseVat).makeGreeter('Hi');

    // Pipeline: call method on the unresolved promise
    const greetingPromise = E(exoPromise).greet('World');

    // Both should resolve correctly
    const greeting = await greetingPromise;
    expect(greeting).toBe('Hi, World!');
  });

  // TODO: Host-side promises from E() calls should be serializable back to vats.
  // Currently, passing a promise received from E(vat).method() to another vat
  // results in the receiving vat getting [object Object] instead of a proper
  // promise that it can await. This documents expected kp kref handling behavior.
  it.todo(
    'passes deferred promise from one vat to another (cross-vat handoff)',
    async () => {
      // Launch subcluster with two promise-vats
      const config: ClusterConfig = {
        bootstrap: 'promiser',
        vats: {
          promiser: {
            bundleSpec: 'http://localhost:3000/promise-vat.bundle',
          },
          awaiter: {
            bundleSpec: 'http://localhost:3000/promise-vat.bundle',
          },
        },
      };

      const { subclusterId, bootstrapRootKref } =
        await kernel.launchSubcluster(config);

      const presenceManager = makePresenceManager({ kernel });

      // Get presences for both vats
      const promiser = presenceManager.resolveKref(
        bootstrapRootKref,
      ) as PromiseVat;
      const vatRootKrefs = getVatRootKrefs(kernel, subclusterId);
      const awaiter = presenceManager.resolveKref(
        vatRootKrefs.awaiter as string,
      ) as PromiseVat;

      // 1. Get deferred promise from promiser (creates kp kref)
      const deferredPromise = E(promiser).makeDeferredPromise();

      // 2. Pass the promise to awaiter (kernel should pass kp kref)
      const awaiterResult = E(awaiter).awaitPromiseArg(deferredPromise);

      // 3. Resolve the deferred promise from promiser
      await E(promiser).resolveDeferredPromise('cross-vat value');

      // 4. awaiterResult should now resolve
      const result = await awaiterResult;
      expect(result).toBe('received: cross-vat value');
    },
  );
});
