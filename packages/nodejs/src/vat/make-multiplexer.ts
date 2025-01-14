import { NodeWorkerMultiplexer } from '@ocap/streams';
import { parentPort } from 'node:worker_threads';

/**
 * Return the parent port of the Node.js worker if it exists; otherwise throw.
 *
 * @returns The parent port.
 * @throws If not called from within a Node.js worker.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getPort() {
  if (!parentPort) {
    const errMsg = 'Expected to run in Node Worker with parentPort.';
    throw new Error(errMsg);
  }
  return parentPort;
}

/**
 * When called from within Node.js worker, returns a Multiplexer which
 * communicates over the parentPort.
 *
 * @param name - The name to give this multiplexer (for traffic logging).
 * @returns A NodeWorkerMultiplexer
 */
export function makeMultiplexer(name?: string): NodeWorkerMultiplexer {
  return new NodeWorkerMultiplexer(getPort(), name);
}
