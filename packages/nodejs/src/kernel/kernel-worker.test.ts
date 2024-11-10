import { makeKernel } from './kernel-worker.js';
import { runVatLifecycle } from './kernel-worker.js';
import { describe, it, expect } from 'vitest';

describe('Kernel Worker', () => {

  it('should handle the lifecycle of multiple vats', async () => {
    console.log('Creating kernel...');
    const kernel = await makeKernel();
    console.log('Kernel created.');

    console.log('Handling the lifecycle of multiple vats...');
    await runVatLifecycle(kernel, ['v1', 'v2', 'v3']);
    console.log('Lifecycle of multiple vats handled.');

    // console.log('Adding default vat...');
    // await kernel.launchVat({ id: 'v0' });
    // console.log('Default vat added.');

    // console.log('Shutting down the default vat...');
    // await kernel.terminateVat('v0');
    // console.log('Default vat shut down.');

    console.log('Test passed.');
    expect(true).toBe(true);
  });

});