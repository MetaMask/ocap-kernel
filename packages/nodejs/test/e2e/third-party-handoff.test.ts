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
  createGreeter: (greeting: string) => Promise<Greeter>;
};
type Carol = {
  receiveAndGreet: (greeter: Greeter, name: string) => Promise<string>;
  storeExo: (exo: unknown) => Promise<string>;
  useStoredExo: (name: string) => Promise<string>;
};
type Greeter = {
  greet: (name: string) => Promise<string>;
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

describe('third-party handoff', () => {
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
  }, 30000);

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
    const greeter = await E(bob).createGreeter('Greetings');

    // 2. Pass exo to Carol (third-party handoff)
    const greeting = await E(carol).receiveAndGreet(greeter, 'Universe');
    expect(greeting).toBe('Greetings, Universe!');
  }, 30000);

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
    const greeter = await E(bob).createGreeter('Howdy');

    // 2. Carol stores the exo in memory
    const storeResult = await E(carol).storeExo(greeter);
    expect(storeResult).toBe('stored');

    // 3. Carol uses the stored exo later
    const greeting = await E(carol).useStoredExo('Partner');
    expect(greeting).toBe('Howdy, Partner!');
  }, 30000);
});
