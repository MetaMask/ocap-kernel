import '@metamask/kernel-shims/endoify';
import { makePromiseKit } from '@endo/promise-kit';
import type { Logger } from '@metamask/logger';
import { Kernel } from '@metamask/ocap-kernel';

import { makeAlice, makeBob } from './utils.ts';

/**
 * Alice's counter relies on Bob's vat if and only if Bob does not handoff.
 *
 * @param kernel - A kernel with a cluster already configured and bootstrapped.
 * @param logger - The same logger the cluster is using.
 */
export async function main(kernel: Kernel, logger: Logger): Promise<void> {
  const exitScript = makePromiseKit<void>();
  const alice = makeAlice(kernel);
  const bob = makeBob(kernel, logger);

  // Alice gets a counter from Bob, who got it from Carol.
  await alice.getCounter();
  // Alice calls the counter every third of a second.
  setInterval(alice.count, 333);
  // Bob becomes unreachable while Alice is counting.
  setTimeout(bob.terminate, 2000);
  setTimeout(exitScript.resolve, 3000);

  await exitScript.promise;
}
