import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import type { LogEntry } from '@metamask/logger';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import type { ClusterConfig } from '@metamask/ocap-kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getBundleSpec,
  makeTestLogger,
  makeKernel,
  extractTestLogs,
} from './utils.ts';

const makeTestSubcluster = (
  testName: string,
  bundleSpec: string,
): ClusterConfig => ({
  bootstrap: 'alice',
  forceReset: true,
  vats: {
    alice: {
      bundleSpec,
      parameters: {
        name: 'Alice',
        test: testName,
      },
    },
    bob: {
      bundleSpec,
      parameters: {
        name: 'Bob',
      },
    },
    carol: {
      bundleSpec,
      parameters: {
        name: 'Carol',
      },
    },
  },
});

describe('liveslots promise handling', () => {
  let kernel: Kernel;
  let entries: LogEntry[];

  beforeEach(async () => {
    const { logger, entries: testEntries } = makeTestLogger();
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    kernel = await makeKernel(kernelDatabase, true, logger);
    entries = testEntries;
  });

  /**
   * Run a test in the set of test vats.
   *
   * @param bundleName - The name of the bundle for the test implementation vat(s).
   * @param testName - The name of the test to run.
   *
   * @returns the bootstrap result.
   */
  async function runTestVats(
    bundleName: string,
    testName: string,
  ): Promise<unknown> {
    const bundleSpec = getBundleSpec(bundleName);
    const { bootstrapResult } = await kernel.launchSubcluster(
      makeTestSubcluster(testName, bundleSpec),
    );
    await waitUntilQuiescent(1000);
    if (bootstrapResult === undefined) {
      throw Error(`this can't happen but eslint is stupid`);
    }
    return kunser(bootstrapResult);
  }

  it('promiseArg1: send promise parameter, resolve after send', async () => {
    const bootstrapResult = await runTestVats('promise-arg-vat', 'promiseArg1');
    expect(bootstrapResult).toBe('bobPSucc');
    const aliceLogs = extractTestLogs(entries, 'Alice');
    expect(aliceLogs).toStrictEqual([
      `running test promiseArg1`,
      `sending the promise to Bob`,
      `resolving the promise that was sent to Bob`,
      `awaiting Bob's response`,
      `Bob's response to hereIsAPromise: 'Bob.hereIsAPromise done'`,
    ]);
    const bobLogs = extractTestLogs(entries, 'Bob');
    expect(bobLogs).toStrictEqual([
      `the promise parameter resolved to 'Alice said hi after send'`,
    ]);
  });

  it('promiseArg2: send promise parameter, resolved before send', async () => {
    const bootstrapResult = await runTestVats('promise-arg-vat', 'promiseArg2');
    expect(bootstrapResult).toBe('bobPSucc');
    const aliceLogs = extractTestLogs(entries, 'Alice');
    expect(aliceLogs).toStrictEqual([
      `running test promiseArg2`,
      `resolving the promise that will be sent to Bob`,
      `sending the promise to Bob`,
      `awaiting Bob's response`,
      `Bob's response to hereIsAPromise: 'Bob.hereIsAPromise done'`,
    ]);
    const bobLogs = extractTestLogs(entries, 'Bob');
    expect(bobLogs).toStrictEqual([
      `the promise parameter resolved to 'Alice said hi before send'`,
    ]);
  });

  it('promiseArg3: send promise parameter, resolve after reply to send', async () => {
    const bootstrapResult = await runTestVats('promise-arg-vat', 'promiseArg3');
    expect(bootstrapResult).toBe('bobPSucc');
    const aliceLogs = extractTestLogs(entries, 'Alice');
    expect(aliceLogs).toStrictEqual([
      `running test promiseArg3`,
      `sending the promise to Bob`,
      `awaiting Bob's response`,
      `Bob's response to hereIsAPromise: 'Bob.hereIsAPromise done'`,
      `resolving the promise that was sent to Bob`,
    ]);
    const bobLogs = extractTestLogs(entries, 'Bob');
    expect(bobLogs).toStrictEqual([
      `the promise parameter resolved to 'Alice said hi after Bob's reply'`,
    ]);
  });

  it('promiseChain: resolve a chain of promises', async () => {
    const bootstrapResult = await runTestVats(
      'promise-chain-vat',
      'promiseChain',
    );
    expect(bootstrapResult).toBe('end of chain');
    const aliceLogs = extractTestLogs(entries, 'Alice');
    expect(aliceLogs).toStrictEqual([
      `running test promiseChain`,
      `waitFor start`,
      `count 0 < 3, recurring...`,
      `waitFor start`,
      `count 1 < 3, recurring...`,
      `waitFor start`,
      `count 2 < 3, recurring...`,
      `waitFor start`,
      `finishing chain`,
    ]);
    const bobLogs = extractTestLogs(entries, 'Bob');
    expect(bobLogs).toStrictEqual([
      `bobGen set value to 1`,
      `bobGen set value to 2`,
      `bobGen set value to 3`,
      `bobGen set value to 4`,
    ]);
  });

  it('promiseCycle: mutually referential promise resolutions', async () => {
    const bootstrapResult = await runTestVats(
      'promise-cycle-vat',
      'promiseCycle',
    );
    expect(bootstrapResult).toBe('done');
    const aliceLogs = extractTestLogs(entries, 'Alice');
    expect(aliceLogs).toStrictEqual([
      `running test promiseCycle`,
      `isPromise(resolutionX[0]): true`,
      `isPromise(resolutionY[0]): true`,
    ]);
    const bobLogs = extractTestLogs(entries, 'Bob');
    expect(bobLogs).toStrictEqual([
      `genPromise1`,
      `genPromise2`,
      `resolveBoth`,
    ]);
  });

  it('promiseCycleMultiCrank: mutually referential promise resolutions across cranks', async () => {
    const bootstrapResult = await runTestVats(
      'promise-cycle-vat',
      'promiseCycleMultiCrank',
    );
    expect(bootstrapResult).toBe('done');
    const aliceLogs = extractTestLogs(entries, 'Alice');
    expect(aliceLogs).toStrictEqual([
      `running test promiseCycleMultiCrank`,
      `isPromise(resolutionX[0]): true`,
      `isPromise(resolutionY[0]): true`,
    ]);
    const bobLogs = extractTestLogs(entries, 'Bob');
    expect(bobLogs).toStrictEqual([
      `genPromise1`,
      `genPromise2`,
      `resolve1`,
      `resolve2`,
    ]);
  });

  it('promiseCrosswise: mutually referential promise resolutions across cranks', async () => {
    const bootstrapResult = await runTestVats(
      'promise-crosswise-vat',
      'promiseCrosswise',
    );
    expect(bootstrapResult).toBe('done');
    const aliceLogs = extractTestLogs(entries, 'Alice');
    expect(aliceLogs).toStrictEqual([
      `running test promiseCrosswise`,
      `isPromise(resolutionX[0]): true`,
      `isPromise(resolutionY[0]): true`,
    ]);
    const bobLogs = extractTestLogs(entries, 'Bob');
    expect(bobLogs).toStrictEqual([`genPromise`, `resolve`]);
    const carolLogs = extractTestLogs(entries, 'Carol');
    expect(carolLogs).toStrictEqual([`genPromise`, `resolve`]);
  });

  it('promiseIndirect: resolution of a resolution of a promise', async () => {
    const bootstrapResult = await runTestVats(
      'promise-indirect-vat',
      'promiseIndirect',
    );
    expect(bootstrapResult).toBe('done');
    const aliceLogs = extractTestLogs(entries, 'Alice');
    expect(aliceLogs).toStrictEqual([
      `running test promiseIndirect`,
      `resolution == hello`,
    ]);
    const bobLogs = extractTestLogs(entries, 'Bob');
    expect(bobLogs).toStrictEqual([`genPromise1`, `genPromise2`, `resolve`]);
  });

  it('passResult: pass a method result as a parameter', async () => {
    const bootstrapResult = await runTestVats('pass-result-vat', 'passResult');
    expect(bootstrapResult).toStrictEqual(['p1succ', 'p2succ']);
    const aliceLogs = extractTestLogs(entries, 'Alice');
    expect(aliceLogs).toStrictEqual([
      `running test passResult`,
      `first result resolved to Bob's first answer`,
      `second result resolved to Bob's second answer`,
    ]);
    const bobLogs = extractTestLogs(entries, 'Bob');
    expect(bobLogs).toStrictEqual([
      `first`,
      `second`,
      `parameter to second resolved to Bob's first answer`,
    ]);
  });

  it('passResultPromise: pass a method promise as a parameter', async () => {
    const bootstrapResult = await runTestVats(
      'pass-result-promise-vat',
      'passResultPromise',
    );
    expect(bootstrapResult).toStrictEqual(['p1succ', 'p2succ']);
    const aliceLogs = extractTestLogs(entries, 'Alice');
    expect(aliceLogs).toStrictEqual([
      `running test passResultPromise`,
      `first result resolved to Bob answers first in second`,
      `second result resolved to Bob's second answer`,
    ]);
    const bobLogs = extractTestLogs(entries, 'Bob');
    expect(bobLogs).toStrictEqual([
      `first`,
      `second`,
      `parameter to second resolved to Bob answers first in second`,
    ]);
  });

  it('resolvePipeline: send to promise resolution', async () => {
    const bootstrapResult = await runTestVats(
      'resolve-pipelined-vat',
      'resolvePipelined',
    );
    expect(bootstrapResult).toStrictEqual(['p1succ', 'p2succ']);
    const aliceLogs = extractTestLogs(entries, 'Alice');
    expect(aliceLogs).toStrictEqual([
      `running test resolvePipelined`,
      `first result resolved to [object Alleged: thing]`,
      `second result resolved to Bob's second answer`,
    ]);
    const bobLogs = extractTestLogs(entries, 'Bob');
    expect(bobLogs).toStrictEqual([`first`, `thing.second`]);
  });

  it('messageToPromise: send to promise before resolution', async () => {
    const bootstrapResult = await runTestVats(
      'message-to-promise-vat',
      'messageToPromise',
    );
    expect(bootstrapResult).toBe('p2succ');
    const aliceLogs = extractTestLogs(entries, 'Alice');
    expect(aliceLogs).toStrictEqual([
      `running test messageToPromise`,
      `invoking loopback`,
      `second result resolved to 'deferred something'`,
      `loopback done`,
    ]);
    const bobLogs = extractTestLogs(entries, 'Bob');
    expect(bobLogs).toStrictEqual([
      `setup`,
      `doResolve`,
      `thing.doSomething`,
      `loopback`,
    ]);
  });
});
