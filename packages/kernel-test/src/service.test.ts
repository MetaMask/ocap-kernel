import { Far } from '@endo/marshal';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Kernel, krefOf } from '@metamask/ocap-kernel';
import type { SlotValue } from '@metamask/ocap-kernel';
import { describe, expect, it } from 'vitest';

import {
  getBundleSpec,
  makeKernel,
  makeTestLogger,
  runTestVats,
  extractTestLogs,
} from './utils.ts';

const testSubcluster = {
  bootstrap: 'main',
  forceReset: true,
  services: ['testService'],
  vats: {
    main: {
      bundleSpec: getBundleSpec('service-vat'),
      parameters: {
        name: 'main',
      },
    },
  },
};

describe('Kernel service object invocation', () => {
  let kernel: Kernel;

  const testService = Far('serviceObject', {
    async getStuff(obj: SlotValue, tag: string): Promise<string> {
      return `${tag} -- ${krefOf(obj)}`;
    },
  });

  it('can invoke a kernel service and get an answer', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const { logger, entries } = makeTestLogger();
    kernel = await makeKernel(kernelDatabase, true, logger);
    kernel.registerKernelServiceObject('testService', testService);

    await runTestVats(kernel, testSubcluster);

    // ko3 ::= the (test) service object
    // ko4 ::= test vat root object
    // ko5 ::= internal object generated inside test vat to have its kref extracted

    await kernel.queueMessage('ko4', 'go', []);
    await waitUntilQuiescent(100);
    const testLogs = extractTestLogs(entries);
    expect(testLogs).toStrictEqual(['kernel service returns hello -- ko5']);
  });

  it('configure subcluster with unknown service throws', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const { logger } = makeTestLogger();
    kernel = await makeKernel(kernelDatabase, true, logger);

    await expect(runTestVats(kernel, testSubcluster)).rejects.toThrow(
      `no registered kernel service 'testService'`,
    );
  });

  it('invoking unknown service method throws', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const { logger, entries } = makeTestLogger();
    kernel = await makeKernel(kernelDatabase, true, logger);
    kernel.registerKernelServiceObject('testService', testService);

    await runTestVats(kernel, testSubcluster);

    // ko3 ::= the (test) service object
    // ko4 ::= test vat root object
    // ko5 ::= internal object generated inside test vat to have its kref extracted

    await kernel.queueMessage('ko4', 'goBadly', []);
    await waitUntilQuiescent(100);
    const testLogs = extractTestLogs(entries);
    expect(testLogs).toStrictEqual([
      `kernel service threw: unknown service method 'nonexistentMethod'`,
    ]);
  });
});
