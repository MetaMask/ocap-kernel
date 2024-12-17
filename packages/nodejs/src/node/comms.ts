import { NodeWorkerMultiplexer } from "@ocap/streams";
import { NodeWorkerDuplexStream } from "@ocap/streams";
import type { MessagePort } from "worker_threads";

const modes = ['direct', 'strum', 'plexed'] as const;

export type Mode = typeof modes[number];
export type Comms = (port: MessagePort) => Promise<void>;

export async function direct(port: MessagePort): Promise<void> {
  console.debug('direct communication init');
  port.on('message', (message) => {
    if (message === 'ping') {
      port.postMessage('pong');
    }
  });
  console.debug('direct communication started');
}

export async function strum(port: MessagePort): Promise<void> {
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

export async function plexed(port: MessagePort): Promise<void> {
  console.log('plexed communication init');
  const multiplexer = new NodeWorkerMultiplexer(port);
  const testChannel = multiplexer.createChannel('test');
  testChannel.drain(async (message) => {
    if (message === 'ping') {
      await testChannel.write('pong');
    }
  }).catch(console.error);
  await multiplexer.start();
  console.log('multiplexer started');
}
