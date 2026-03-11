import { isJsonRpcMessage } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { splitLoggerStream } from '@metamask/logger';
import { NodeWorkerDuplexStream } from '@metamask/streams';
import type { DuplexStream } from '@metamask/streams';
import { parentPort } from 'node:worker_threads';
import type { MessagePort as NodePort } from 'node:worker_threads';

/**
 * Return the parent port of the Node.js worker if it exists; otherwise throw.
 *
 * @returns The parent port.
 * @throws If not called from within a Node.js worker.
 */
export function getPort(): NodePort {
  if (!parentPort) {
    throw new Error('Expected to run in a Node.js worker with parentPort.');
  }
  return parentPort;
}

/**
 * When called from within Node.js worker, returns a DuplexStream which
 * communicates over the parentPort.
 *
 * @returns A pair of NodeWorkerDuplexStreams
 */
export async function makeStreams(): Promise<{
  kernelStream: DuplexStream<JsonRpcMessage>;
  loggerStream: DuplexStream<JsonRpcMessage>;
}> {
  const stream = new NodeWorkerDuplexStream<JsonRpcMessage>(
    getPort(),
    isJsonRpcMessage,
  );

  const { kernelStream, loggerStream } = splitLoggerStream(stream);

  await stream.synchronize();

  return { kernelStream, loggerStream };
}
