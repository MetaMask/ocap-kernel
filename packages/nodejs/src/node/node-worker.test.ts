import '@ocap/shims/endoify';
import { describe, it, expect } from 'vitest';

import { Worker as NodeWorker } from 'node:worker_threads';
import { makePromiseKit } from '@endo/promise-kit';
import { NodeWorkerDuplexStream } from '@ocap/streams';
import { existsSync } from 'node:fs';
import type { Comms, Mode } from './comms.js';

const workerFileURL = new URL('../../dist/node/node-worker.mjs', import.meta.url)
.pathname;

describe('Node Worker', () => {
  const makeWorker = (mode: Mode) => new NodeWorker(workerFileURL, {
    env: {
      COMMS: mode,
    },
    execArgv: process.env.VITEST ? ['--loader', 'tsx'] : undefined,
  });

  it('communicates directly via worker.postMessage', async () => {
    const { resolve, promise } = makePromiseKit<string>();

    expect(existsSync(workerFileURL), 'No workerFile found').toBe(true);

    const worker = makeWorker('direct');

    worker.once('online', () => worker.postMessage('ping'));
    worker.on('message', (message: string) => resolve(message));

    expect(await promise).toBe('pong');
  });

  it('communicates via NodeWorkerStream', async () => {
    const { resolve, promise } = makePromiseKit<string>();

    const worker = makeWorker('strum');
    const stream = new NodeWorkerDuplexStream(worker);
    worker.once('online', async () => {
      console.debug('synchronizing node worker stream');
      await stream.synchronize();
      console.debug('sending ping to strum node worker');
      await stream.write('ping');
    });

    for await (const value of stream) {
      if (typeof value === 'string') {
        resolve(value);
        break;
      }
    }
    
    expect(await promise).toBe('pong');
  });
});
