import '@metamask/kernel-shims/endoify';
import { NodeWorkerDuplexStream } from '@metamask/streams';
import { parentPort } from 'node:worker_threads';

main().catch(console.error);

/**
 * The main function for the worker.
 */
async function main() {
  const stream = await NodeWorkerDuplexStream.make(parentPort);
  await stream.write({
    jsonrpc: '2.0',
    method: 'notify',
    params: ['Hello, world!'],
  });
}
