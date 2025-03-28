// eslint-disable-next-line spaced-comment
/// <reference types="vite/client" />

import { Kernel, kunser } from '@ocap/kernel';
import type {
  ClusterConfig,
  KernelCommand,
  KernelCommandReply,
} from '@ocap/kernel';
import { NodejsVatWorkerService } from '@ocap/nodejs';
import type { KernelDatabase } from '@ocap/store';
import { NodeWorkerDuplexStream } from '@ocap/streams';
import { waitUntilQuiescent } from '@ocap/utils';
import {
  MessagePort as NodeMessagePort,
  MessageChannel as NodeMessageChannel,
} from 'node:worker_threads';

/**
 * Construct a bundle path URL from a bundle name.
 *
 * @param bundleName - The name of the bundle.
 *
 * @returns a path string for the named bundle.
 */
export function getBundleSpec(bundleName: string): string {
  return new URL(`./vats/${bundleName}.bundle`, import.meta.url).toString();
}

/**
 * Run the set of test vats.
 *
 * @param kernel - The kernel to run in.
 * @param config - Subcluster configuration telling what vats to run.
 *
 * @returns the bootstrap result.
 */
export async function runTestVats(
  kernel: Kernel,
  config: ClusterConfig,
): Promise<unknown> {
  const bootstrapResultRaw = await kernel.launchSubcluster(config);
  await waitUntilQuiescent();
  if (bootstrapResultRaw === undefined) {
    throw Error(`this can't happen but eslint is stupid`);
  }
  return kunser(bootstrapResultRaw);
}

/**
 * Handle all the boilerplate to set up a kernel instance.
 *
 * @param kernelDatabase - The database that will hold the persistent state.
 * @param resetStorage - If true, reset the database as part of setting up.
 *
 * @returns the new kernel instance.
 */
export async function makeKernel(
  kernelDatabase: KernelDatabase,
  resetStorage: boolean,
): Promise<Kernel> {
  const kernelPort: NodeMessagePort = new NodeMessageChannel().port1;
  const nodeStream = new NodeWorkerDuplexStream<
    KernelCommand,
    KernelCommandReply
  >(kernelPort);
  const vatWorkerClient = new NodejsVatWorkerService({});
  const kernel = await Kernel.make(
    nodeStream,
    vatWorkerClient,
    kernelDatabase,
    {
      resetStorage,
    },
  );
  return kernel;
}
