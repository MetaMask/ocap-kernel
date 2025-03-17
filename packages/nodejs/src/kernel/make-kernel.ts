import type { KernelCommand, KernelCommandReply } from '@ocap/kernel';
import { isKernelCommand, Kernel } from '@ocap/kernel';
import { makeSQLKVStore } from '@ocap/store/sqlite/nodejs';
import { NodeWorkerDuplexStream } from '@ocap/streams';
import { MessagePort as NodeMessagePort } from 'node:worker_threads';

import { NodejsVatWorkerService } from './VatWorkerService.ts';

type MakeKernelArgs = {
  port: NodeMessagePort;
  vatWorkerServiceOptions?: ConstructorParameters<
    typeof NodejsVatWorkerService
  >[0];
};

/**
 * The main function for the kernel worker.
 *
 * @param params - The parameters for the kernel.
 * @param params.port - The kernel's end of a node:worker_threads MessageChannel
 * @param params.vatWorkerServiceOptions - The options for the vat worker service.
 * @returns The kernel, initialized.
 */
export async function makeKernel({
  port,
  vatWorkerServiceOptions,
}: MakeKernelArgs): Promise<Kernel> {
  const nodeStream = new NodeWorkerDuplexStream<
    KernelCommand,
    KernelCommandReply
  >(port, isKernelCommand);
  const vatWorkerClient = new NodejsVatWorkerService(
    vatWorkerServiceOptions ?? {},
  );

  // Initialize kernel store.
  const kvStore = await makeSQLKVStore();
  kvStore.clear();

  // Create and start kernel.
  const kernel = await Kernel.make(nodeStream, vatWorkerClient, kvStore);

  return kernel;
}
