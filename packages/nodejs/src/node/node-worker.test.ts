import '@ocap/shims/endoify';

import { makePromiseKit } from '@endo/promise-kit';
import { NodeWorkerDuplexStream, NodeWorkerMultiplexer } from '@ocap/streams';
import { Worker as NodeWorker } from 'node:worker_threads';
import { describe, it, expect } from 'vitest';

import type { Mode } from './comms.js';

const workerFileURL = new URL(
  '../../dist/node/node-worker.mjs',
  import.meta.url,
).pathname;

describe('Node Worker', () => {
  const makeWorker = (mode: Mode): NodeWorker =>
    new NodeWorker(workerFileURL, {
      env: {
        COMMS: mode,
      },
      execArgv: ['--loader', 'tsx'],
    });

  it('communicates directly via worker.postMessage', async () => {
    const { resolve, promise } = makePromiseKit<string>();

    const worker = makeWorker('direct');

    worker.once('online', () => worker.postMessage('ping'));
    worker.on('message', (message: string) => resolve(message));

    expect(await promise).toBe('pong');
  });

  it('communicates via NodeWorkerStream', async () => {
    const { resolve, promise, reject } = makePromiseKit<string>();

    const worker = makeWorker('strum');
    const stream = new NodeWorkerDuplexStream(worker);
    worker.once('online', () => {
      stream
        .synchronize()
        .then(async () => stream.write('ping'))
        .catch(reject);
    });

    for await (const value of stream) {
      if (typeof value === 'string') {
        resolve(value);
        break;
      }
    }

    expect(await promise).toBe('pong');
  });

  it('communicates over NodeWorkerMultiplexer', async () => {
    const { resolve, promise, reject } = makePromiseKit<string>();

    const worker = makeWorker('plexed');
    const multiplexer = new NodeWorkerMultiplexer(worker);
    const testChannel = multiplexer.createChannel('test');
    multiplexer.start().catch(reject);
    worker.once('online', () => {
      testChannel.write('ping').catch(reject);
    });

    testChannel
      .drain(async (value: unknown) => {
        console.debug('rebounded:', value);
        if (typeof value === 'string') {
          resolve(value);
        }
      })
      .catch(reject);

    expect(await promise).toBe('pong');
  });
});
