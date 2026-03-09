import { makeCapTP } from '@endo/captp';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import type { ClusterConfig } from '@metamask/ocap-kernel';
import { Worker } from 'node:worker_threads';
import { describe, it, expect, afterEach } from 'vitest';

import { makeTestKernel } from '../helpers/kernel.ts';

const CAPTP_SERVICE_VAT_BUNDLE_URL =
  'http://localhost:3000/captp-service-vat.bundle';

const READY_SIGNAL = 'captp-service-client:ready';

const workerPath = new URL(
  '../workers/captp-service-client.js',
  import.meta.url,
).pathname;

describe('CapTP kernel service registration', { timeout: 30_000 }, () => {
  let kernel: Kernel | undefined;
  let worker: Worker | undefined;
  let abortCapTP: ((reason?: unknown) => void) | undefined;

  afterEach(async () => {
    abortCapTP?.('test cleanup');
    abortCapTP = undefined;

    if (worker) {
      const workerRef = worker;
      worker = undefined;
      await workerRef.terminate();
    }

    if (kernel) {
      const stopResult = kernel.stop();
      kernel = undefined;
      await stopResult;
    }
  });

  it('vat invokes a method on a service object registered over CapTP from a worker', async () => {
    // 1. Create a real kernel
    kernel = await makeTestKernel(
      await makeSQLKernelDatabase({ dbFilename: ':memory:' }),
    );

    // 2. Spawn the worker that will act as the CapTP client
    worker = new Worker(workerPath);

    // 3. Set up CapTP on the main thread (kernel side)
    const { dispatch, abort } = makeCapTP(
      'kernel',
      (message: Record<string, unknown>) => worker!.postMessage(message),
      kernel.provideFacet(),
    );
    abortCapTP = abort;

    // 4. Wire up message dispatching from worker → kernel CapTP
    //    and wait for the worker to signal that registration is complete
    await new Promise<void>((resolve, reject) => {
      worker!.on('message', (message: unknown) => {
        if (message === READY_SIGNAL) {
          resolve();
        } else {
          dispatch(message as Record<string, unknown>);
        }
      });
      worker!.on('error', reject);
      worker!.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`));
        }
      });
    });

    // 5. Launch a subcluster with a vat that uses the 'testService' service
    const config: ClusterConfig = {
      bootstrap: 'main',
      services: ['testService'],
      vats: {
        main: {
          bundleSpec: CAPTP_SERVICE_VAT_BUNDLE_URL,
        },
      },
    };

    const { rootKref } = await kernel.launchSubcluster(config);
    await waitUntilQuiescent();

    // 6. Have the vat call E(testService).doSomething(3, 4) and verify the result
    const result = await kernel.queueMessage(rootKref, 'go', []);
    await waitUntilQuiescent();

    expect(kunser(result)).toBe(7);
  });
});
