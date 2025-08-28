import type { CapData } from '@endo/marshal';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { kunser, makeKernelStore } from '@metamask/ocap-kernel';
import { unlink } from 'node:fs/promises';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  getBundleSpec,
  makeKernel,
  makeTestLogger,
  runResume,
  runTestVats,
} from './utils.ts';

describe('persistent storage', { timeout: 10_000 }, () => {
  let logger: ReturnType<typeof makeTestLogger>;
  let databasePath: string;

  beforeEach(async () => {
    // Create a unique database file for each test in the current directory
    databasePath = `./persistence-test-${Date.now()}-${Math.random()}.db`;
    logger = makeTestLogger();
  });

  afterEach(async () => {
    // Clean up the database file
    try {
      await unlink(databasePath);
    } catch {
      // Ignore errors if file doesn't exist
    }
  });

  const testSubcluster = {
    bootstrap: 'counter',
    vats: {
      counter: {
        bundleSpec: getBundleSpec('persistence-counter-vat'),
        parameters: {
          name: 'Counter',
        },
      },
    },
  };

  it('maintains state across kernel restarts', async () => {
    const database = await makeSQLKernelDatabase({ dbFilename: databasePath });
    const kernel1 = await makeKernel(
      database,
      false,
      logger.logger.subLogger({ tags: ['test'] }),
    );
    const result1 = await runTestVats(kernel1, testSubcluster);
    expect(result1).toBe('Counter initialized with count: 1');
    await waitUntilQuiescent();
    const incrementResult1 = await runResume(kernel1, 'ko1');
    expect(incrementResult1).toBe('Counter incremented to: 2');
    await waitUntilQuiescent();
    await kernel1.stop();
    const kernel2 = await makeKernel(
      database,
      false,
      logger.logger.subLogger({ tags: ['test'] }),
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const resumeResult = await runResume(kernel2, 'ko1');
    expect(resumeResult).toBe('Counter incremented to: 3');
  });

  it('handles multiple vats with persistent state', async () => {
    const multiVatCluster = {
      bootstrap: 'coordinator',
      vats: {
        coordinator: {
          bundleSpec: getBundleSpec('persistence-coordinator-vat'),
          parameters: { name: 'Coordinator' },
        },
        worker1: {
          bundleSpec: getBundleSpec('persistence-worker-vat'),
          parameters: { name: 'Worker1', id: 1 },
        },
        worker2: {
          bundleSpec: getBundleSpec('persistence-worker-vat'),
          parameters: { name: 'Worker2', id: 2 },
        },
      },
    };
    const database = await makeSQLKernelDatabase({ dbFilename: databasePath });
    const kernel1 = await makeKernel(
      database,
      false,
      logger.logger.subLogger({ tags: ['test'] }),
    );
    const result1 = await runTestVats(kernel1, multiVatCluster);
    expect(result1).toBe('Coordinator initialized with 2 workers');
    await waitUntilQuiescent();
    const workResult1 = await runResume(kernel1, 'ko1');
    expect(workResult1).toBe('Work completed: Worker1(1), Worker2(1)');
    await waitUntilQuiescent();
    await kernel1.stop();
    const kernel2 = await makeKernel(
      database,
      false,
      logger.logger.subLogger({ tags: ['test'] }),
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const workResult2 = await runResume(kernel2, 'ko1');
    expect(workResult2).toBe('Work completed: Worker1(2), Worker2(2)');
  });

  it('respects resetStorage flag when set to true', async () => {
    const database1 = await makeSQLKernelDatabase({ dbFilename: databasePath });
    const kernel1 = await makeKernel(
      database1,
      false,
      logger.logger.subLogger({ tags: ['test'] }),
    );
    await runTestVats(kernel1, testSubcluster);
    await waitUntilQuiescent();
    await runResume(kernel1, 'ko1');
    await waitUntilQuiescent();
    await kernel1.stop();
    const database2 = await makeSQLKernelDatabase({ dbFilename: databasePath });
    const kernel2 = await makeKernel(
      database2,
      true,
      logger.logger.subLogger({ tags: ['test'] }),
    );
    const result2 = await runTestVats(kernel2, testSubcluster);
    expect(result2).toBe('Counter initialized with count: 1');
  });

  it('handles vat restarts within persistent kernel', async () => {
    const database = await makeSQLKernelDatabase({ dbFilename: databasePath });
    const kernel = await makeKernel(
      database,
      false,
      logger.logger.subLogger({ tags: ['test'] }),
    );
    await runTestVats(kernel, testSubcluster);
    await runResume(kernel, 'ko1');
    await kernel.restartVat('v1');
    const resumeResult = await runResume(kernel, 'ko1');
    expect(resumeResult).toBe('Counter incremented to: 3');
  });

  it('handles messages in queue after kernel restart', async () => {
    const database = await makeSQLKernelDatabase({ dbFilename: databasePath });
    const kernelStore = makeKernelStore(database);
    const kernel1 = await makeKernel(
      database,
      false,
      logger.logger.subLogger({ tags: ['test'] }),
    );
    const bootstrapResult = await kernel1.launchSubcluster(testSubcluster);
    expect(kunser(bootstrapResult as CapData<string>)).toBe(
      'Counter initialized with count: 1',
    );
    await waitUntilQuiescent();
    // Process one message to verify the vat is working
    const result1 = await kernel1.queueMessage('ko1', 'resume', []);
    expect(kunser(result1)).toBe('Counter incremented to: 2');
    // Enqueue a send message into the database
    kernelStore.kv.set('queue.run.head', '4');
    kernelStore.kv.set('nextPromiseId', '4');
    kernelStore.kv.set('ko1.refCount', '3,3');
    kernelStore.kv.set('queue.kp3.head', '1');
    kernelStore.kv.set('queue.kp3.tail', '1');
    kernelStore.kv.set('kp3.state', 'unresolved');
    kernelStore.kv.set('kp3.subscribers', '[]');
    kernelStore.kv.set('kp3.refCount', '2');
    kernelStore.kv.set(
      'queue.run.3',
      '{"type":"send","target":"ko1","message":{"methargs":{"body":"#[\\"resume\\",[]]","slots":[]},"result":"kp3"}}',
    );
    // verify that the message is in the database
    expect(kernelStore.kv.get('queue.run.3')).toBeDefined();
    await kernel1.stop();
    // restart the kernel
    const kernel2 = await makeKernel(
      database,
      false,
      logger.logger.subLogger({ tags: ['test'] }),
    );
    // verify that the run queue is empty
    expect(kernelStore.kv.get('queue.run.3')).toBeUndefined();
    // verify that the message is processed and the counter is incremented
    const result2 = await kernel2.queueMessage('ko1', 'resume', []);
    expect(kunser(result2)).toBe('Counter incremented to: 4');
  });
});
