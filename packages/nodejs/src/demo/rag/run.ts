import '@ocap/shims/endoify';

import { Kernel } from '@ocap/kernel';
import type { ClusterConfig } from '@ocap/kernel';
import { MessageChannel as NodeMessageChannel } from 'node:worker_threads';

import { documentRoot } from './documents/root.ts';
import { makeSubclusterConfig } from './subclusterConfig.ts';
import { makeKernel } from '../../kernel/make-kernel.ts';

const args = {
  verbose: process.argv.includes('--verbose'),
};

main(args).catch(console.error);

/**
 * The main function for the demo.
 *
 * @param options0 - The options for the demo.
 * @param options0.verbose - Whether to run the demo in verbose mode.
 */
async function main({ verbose }: { verbose: boolean }): Promise<void> {
  // This port does nothing; we don't talk to the Kernel via a console (yet).
  const kernelPort = new NodeMessageChannel().port1;

  // Make and start the kernel using the demo's subcluster config.
  const kernel: Kernel = await makeKernel({
    port: kernelPort,
    vatWorkerServiceOptions: {
      makeDocumentRoot: async () => documentRoot,
    },
  });
  const config: ClusterConfig = makeSubclusterConfig(verbose);
  await kernel.launchSubcluster(config);
}
