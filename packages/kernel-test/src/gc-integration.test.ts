import '@ocap/shims/endoify';
import type { ClusterConfig } from '@ocap/kernel';
import { makeSQLKernelDatabase } from '@ocap/store/sqlite/nodejs';
import { describe, expect, it } from 'vitest';

import {
  extractVatLogs,
  getBundleSpec,
  makeKernel,
  runTestVats,
} from './utils.ts';

const origStdoutWrite = process.stdout.write.bind(process.stdout);
let buffered: string = '';
// @ts-expect-error Some type def used by lint is just wrong (compiler likes it ok, but lint whines)
process.stdout.write = (buffer: string, encoding, callback): void => {
  buffered += buffer;
  origStdoutWrite(buffer, encoding, callback);
};

// Define a very simple test cluster
const simpleGCTestSubcluster: ClusterConfig = {
  bootstrap: 'gcVat',
  forceReset: true,
  bundles: null,
  vats: {
    gcVat: {
      bundleSpec: getBundleSpec('gc-test-vat'),
      parameters: {
        name: 'GCVat',
      },
    },
  },
};

describe('Simple GC Tests', () => {
  it('should create a WeakRef successfully', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const kernel = await makeKernel(kernelDatabase, true);
    const bootstrapResult = await runTestVats(kernel, simpleGCTestSubcluster);
    expect(bootstrapResult).toBe('gc-test-complete');
    const vatLogs = extractVatLogs(buffered);
    expect(vatLogs).toContain(
      'GCVat: WeakRef created and object is accessible',
    );
  }, 10000);
});
