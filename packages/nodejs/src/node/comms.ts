import { NodeWorkerMultiplexer, NodeWorkerDuplexStream } from '@ocap/streams';
import type { MessagePort as WorkerPort } from 'worker_threads';

export const modes = ['direct', 'strum', 'plexed'] as const;
export type Mode = (typeof modes)[number];
export type Comms = (port: WorkerPort) => Promise<void>;

/**
 * Run the pong end of ping-pong via on + postMessage.
 *
 * @param port - The port to communicate over.
 */
export async function direct(port: WorkerPort): Promise<void> {
  console.debug('direct communication init');
  port.on('message', (message) => {
    if (message === 'ping') {
      port.postMessage('pong');
    }
  });
  console.debug('direct communication started');
}

/**
 * Run the pong end of ping-pong on a duplex stream.
 
 * @param port - The port to communicate over.
 */
export async function strum(port: WorkerPort): Promise<void> {
  console.log('streamed communication init');
  const stream = new NodeWorkerDuplexStream(port);
  await stream.synchronize();
  for await (const message of stream) {
    if (message === 'ping') {
      await stream.write('pong');
    }
  }
  console.log('streamed communication started');
}

/**
 * Run the pong end of ping-pong on a multiplexer.
 *
 * @param port - The port to communicate over.
 */
export async function plexed(port: WorkerPort): Promise<void> {
  console.log('plexed communication init');
  const multiplexer = new NodeWorkerMultiplexer(port);
  const testChannel = multiplexer.createChannel('test');
  multiplexer.start().catch(console.error);
  testChannel
    .drain(async (message) => {
      console.debug('testChannel drain:', message);
      if (message === 'ping') {
        await testChannel.write('pong');
      }
    })
    .catch(console.error);
  console.log('multiplexer started');
}
