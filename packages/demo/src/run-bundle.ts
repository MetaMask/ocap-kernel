import '@metamask/kernel-shims/endoify';
import { Fail } from '@endo/errors';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { stringify, waitUntilQuiescent } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import type { ClusterConfig } from '@metamask/ocap-kernel';
import { NodeWorkerDuplexStream } from '@metamask/streams';
import type { Json, JsonRpcRequest, JsonRpcResponse } from '@metamask/utils';
import { NodejsVatWorkerService } from '@ocap/nodejs';
import { resolve } from 'node:path';

const bootstrapBundlePath = resolve(
  import.meta.url,
  '../../src/vats/bootstrap.bundle',
);

/**
 * Run a bundle file and call a specific method on its root object.
 *
 * @param bundlePath - Path to the bundle file
 * @param methodName - Name of the method to call on the root object
 * @param options - Options for the bundle
 * @param options.bundleParameters - Parameters to pass to the bundle
 * @param options.args - Arguments to pass to the method
 * @param options.logger - Logger to use for the bundle
 * @returns The result of calling the method
 */
export async function runBundle(
  bundlePath: string,
  methodName: string,
  options: {
    bundleParameters?: Record<string, Json>;
    args?: Json[];
    logger?: Logger;
  },
): Promise<unknown> {
  const { bundleParameters = {}, args = [] } = options;
  const logger = options.logger ?? new Logger('run-bundle');

  logger.log('Creating kernel database...');

  // Create kernel database
  const kernelDatabase = await makeSQLKernelDatabase({
    dbFilename: ':memory:',
    verbose: false,
  });

  logger.log('Creating message channel...');

  // Create message channel for kernel communication
  const { port1 } = new MessageChannel();
  const kernelStream = new NodeWorkerDuplexStream<
    JsonRpcRequest,
    JsonRpcResponse
  >(port1);

  logger.log('Creating vat worker service...');

  // Create vat worker service
  const vatWorkerService = new NodejsVatWorkerService({
    logger: logger.subLogger('vat-worker'),
  });

  logger.log('Creating kernel...');

  const kernelOptions = {
    resetStorage: true,
    logger: logger.subLogger('kernel'),
  };

  // Create kernel
  const kernel = await Kernel.make(
    kernelStream,
    vatWorkerService,
    kernelDatabase,
    kernelOptions,
  );

  // Create subcluster config
  const config: ClusterConfig = {
    bootstrap: 'main',
    forceReset: true,
    vats: {
      main: {
        bundleSpec: `file://${bootstrapBundlePath}`,
        parameters: {
          methodName,
          args,
        },
      },
      target: {
        bundleSpec: `file://${bundlePath}`,
        parameters: bundleParameters,
      },
    },
  };

  logger.log('Launching subcluster...');

  // Launch subcluster and wait for quiescence
  const bootstrapResultRaw = await kernel.launchSubcluster(config);

  logger.log('Waiting for quiescence...');

  await waitUntilQuiescent(1000);

  // Unserialize the bootstrap result
  const result =
    kunser(bootstrapResultRaw ?? Fail`Bootstrap result is undefined`) ??
    Fail`Bootstrap result is undefined`;

  // If the result is an error, throw it
  if (
    typeof result === 'object' &&
    'name' in result &&
    typeof result.name === 'string' &&
    result.name.includes('Error')
  ) {
    throw new Error(
      (result as { message?: string }).message ??
        `Unknown error: ${stringify(result)}`,
    );
  }

  // Otherwise, return the result
  return result;
}
