import '@ocap/shims/endoify';

import { MessageChannel as NodeMessageChannel } from 'node:worker_threads';
import { describe, it, expect, vi } from 'vitest';

import { makeKernel, runVatLifecycle } from '../../src/kernel/kernel-worker.js';

vi.mock('node:process', () => ({
  exit: vi.fn((reason) => {
    throw new Error(`process.exit: ${reason}`);
  }),
}));

describe('Kernel Worker', () => {
  it('should handle the lifecycle of multiple vats', async () => {
    console.log('Started test.');
    const kernelChannel = new NodeMessageChannel();
    const { port1: kernelPort } = kernelChannel;
    console.log('Creating kernel...');
    const kernel = await makeKernel(kernelPort);
    console.log('Kernel created.');

    console.log('Handling the lifecycle of multiple vats...');
    await runVatLifecycle(kernel, ['v1', 'v2', 'v3']);
    console.log('Lifecycle of multiple vats handled.');

    console.log('Test passed.');
    expect(true).toBe(true);
  });
});
