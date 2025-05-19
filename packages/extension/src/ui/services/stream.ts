import {
  rpcMethodSpecs,
  establishKernelConnection,
} from '@metamask/kernel-browser-runtime';
import type { KernelControlMethod } from '@metamask/kernel-browser-runtime';
import { RpcClient } from '@metamask/kernel-rpc-methods';
import type {
  ExtractParams,
  ExtractResult,
} from '@metamask/kernel-rpc-methods';

import { logger } from './logger.ts';

export type CallKernelMethod = <Method extends KernelControlMethod>(command: {
  method: Method;
  params: ExtractParams<Method, typeof rpcMethodSpecs>;
}) => Promise<ExtractResult<Method, typeof rpcMethodSpecs>>;

/**
 * Setup the stream for sending and receiving messages.
 *
 * @returns A function for sending messages.
 */
export async function setupStream(): Promise<{
  callKernelMethod: CallKernelMethod;
}> {
  const kernelStream = await establishKernelConnection({ logger });

  const rpcClient = new RpcClient(
    rpcMethodSpecs,
    async (request) => {
      await kernelStream.write(request);
    },
    'panel',
  );

  const cleanup = (): void => {
    rpcClient.rejectAll(new Error('Stream disconnected'));
    // Explicitly _do not_ return the stream, as the connection will be
    // re-established when the panel is reloaded. If we return the stream,
    // the remote end will be closed and the connection irrevocably lost.
  };

  window.addEventListener('unload', cleanup);

  kernelStream
    .drain(async (response) => {
      if (typeof response.id !== 'string') {
        throw new Error('Invalid response id');
      }

      rpcClient.handleResponse(response.id, response);
    })
    .catch((error) => {
      logger.error('error draining kernel stream', error);
    })
    .finally(cleanup);

  const callKernelMethod: CallKernelMethod = async (payload) => {
    logger.log('sending message', payload);
    return await rpcClient.call(payload.method, payload.params);
  };

  return { callKernelMethod };
}
