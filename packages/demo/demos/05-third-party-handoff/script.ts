import '@metamask/kernel-shims/endoify';
import { makePromiseKit } from '@endo/promise-kit';
import { Kernel } from '@metamask/ocap-kernel';

/**
 * Alice's counter relies on Bob's vat if and only if Bob does not handoff.
 *
 * @param kernel - A kernel with a cluster already configured and bootstrapped.
 */
export async function main(kernel: Kernel): Promise<void> {
  const { promise, resolve } = makePromiseKit<void>();
  const alice = {
    getCounter: async () => kernel.queueMessage('ko2', 'getCounter', []),
    count: () => void kernel.queueMessage('ko2', 'count', []),
  };
  const bob = {
    stop: () => void kernel.terminateVat('v3'),
  };

  await alice.getCounter();
  setInterval(alice.count, 500);
  setTimeout(bob.stop, 5100);
  setTimeout(resolve, 8000);

  await promise;
}
