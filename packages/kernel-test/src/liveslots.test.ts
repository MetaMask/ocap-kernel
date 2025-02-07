import '@ocap/shims/endoify';
import { Kernel } from '@ocap/kernel';
import {
  MessagePort as NodeMessagePort,
  MessageChannel as NodeMessageChannel,
} from 'node:worker_threads';
import { beforeEach, describe, expect, it } from 'vitest';

import { kunser } from '../../kernel/src/kernel-marshal.js';
import { makeKernel } from '../../nodejs/src/kernel/make-kernel.js';

const origStdoutWrite = process.stdout.write.bind(process.stdout);
let buffered: string = '';
// @ts-expect-error Some type def used by lint is just wrong (compiler likes it ok, but lint whines)
process.stdout.write = (buffer: string, encoding, callback): void => {
  buffered += buffer;
  origStdoutWrite(buffer, encoding, callback);
};

const testSubcluster = {
  bootstrap: 'alice',
  forceReset: true,
  vats: {
    alice: {
      bundleSpec: 'bundle name',
      parameters: {
        name: 'Alice',
        test: 'put the test name here',
      },
    },
    bob: {
      bundleSpec: 'bundle name',
      parameters: {
        name: 'Bob',
      },
    },
    carol: {
      bundleSpec: 'bundle name',
      parameters: {
        name: 'Carol',
      },
    },
  },
};

describe('liveslots promise handling', () => {
  let kernel: Kernel;

  beforeEach(async () => {
    const kernelPort: NodeMessagePort = new NodeMessageChannel().port1;
    kernel = await makeKernel(kernelPort, undefined, true);
  });

  /**
   * Run a test in the set of test vats.
   *
   * @param bundleName - The name of the bundle for the test implementation vat(s).
   * @param testName - The name of the test to run.
   *
   * @returns a tuple of the bootstrap result and the execution log output.
   */
  async function runTestVats(
    bundleName: string,
    testName: string,
  ): Promise<[unknown, string[]]> {
    buffered = '';
    const bundleSpec = `${new URL(`${bundleName}.bundle`, import.meta.url)}`;
    testSubcluster.vats.alice.parameters.test = testName;
    testSubcluster.vats.alice.bundleSpec = bundleSpec;
    testSubcluster.vats.bob.bundleSpec = bundleSpec;
    testSubcluster.vats.carol.bundleSpec = bundleSpec;
    const bootstrapResultRaw = await kernel.launchSubcluster(testSubcluster);
    const vatLogs = buffered
      .split('\n')
      .filter((line: string) => line.startsWith('::> '))
      .map((line: string) => line.slice(4));
    if (bootstrapResultRaw === undefined) {
      throw Error(`this can't happen but eslint is stupid`);
    }
    return [kunser(bootstrapResultRaw), vatLogs];
  }

  it('promiseArg1: send promise parameter, resolve after send', async () => {
    const [bootstrapResult, vatLogs] = await runTestVats(
      'promise-arg-vat',
      'promiseArg1',
    );
    expect(bootstrapResult).toBe('bobPSucc');
    const reference = [
      `Alice: running test promiseArg1`,
      `Alice: sending the promise to Bob`,
      `Alice: resolving the promise that was sent to Bob`,
      `Alice: awaiting Bob's response`,
      `Bob: the promise parameter resolved to 'Alice said hi after send'`,
      `Alice: Bob's response to hereIsAPromise: 'Bob.hereIsAPromise done'`,
    ];
    expect(vatLogs).toStrictEqual(reference);
  });

  it('promiseArg2: send promise parameter, resolved before send', async () => {
    const [bootstrapResult, vatLogs] = await runTestVats(
      'promise-arg-vat',
      'promiseArg2',
    );
    expect(bootstrapResult).toBe('bobPSucc');
    const reference = [
      `Alice: running test promiseArg2`,
      `Alice: resolving the promise that will be sent to Bob`,
      `Alice: sending the promise to Bob`,
      `Alice: awaiting Bob's response`,
      `Bob: the promise parameter resolved to 'Alice said hi before send'`,
      `Alice: Bob's response to hereIsAPromise: 'Bob.hereIsAPromise done'`,
    ];
    expect(vatLogs).toStrictEqual(reference);
  });

  it('promiseArg3: send promise parameter, resolve after reply to send', async () => {
    const [bootstrapResult, vatLogs] = await runTestVats(
      'promise-arg-vat',
      'promiseArg3',
    );
    expect(bootstrapResult).toBe('bobPSucc');
    const reference = [
      `Alice: running test promiseArg3`,
      `Alice: sending the promise to Bob`,
      `Alice: awaiting Bob's response`,
      `Alice: Bob's response to hereIsAPromise: 'Bob.hereIsAPromise done'`,
      `Alice: resolving the promise that was sent to Bob`,
      `Bob: the promise parameter resolved to 'Alice said hi after Bob's reply'`,
    ];
    expect(vatLogs).toStrictEqual(reference);
  });

  it('promiseChain: resolve a chain of promises', async () => {
    const [bootstrapResult, vatLogs] = await runTestVats(
      'promise-chain-vat',
      'promiseChain',
    );
    expect(bootstrapResult).toBe('end of chain');
    const reference = [
      `Alice: running test promiseChain`,
      `Bob: bobGen set value to 1`,
      `Alice: waitFor start`,
      `Alice: count 0 < 3, recurring...`,
      `Bob: bobGen set value to 2`,
      `Alice: waitFor start`,
      `Alice: count 1 < 3, recurring...`,
      `Bob: bobGen set value to 3`,
      `Alice: waitFor start`,
      `Alice: count 2 < 3, recurring...`,
      `Bob: bobGen set value to 4`,
      `Alice: waitFor start`,
    ];
    expect(vatLogs).toStrictEqual(reference);
  });

  it('promiseCycle: mutually referential promise resolutions', async () => {
    const [bootstrapResult, vatLogs] = await runTestVats(
      'promise-cycle-vat',
      'promiseCycle',
    );
    expect(bootstrapResult).toBe('done');
    const reference = [
      `Alice: running test promiseCycle`,
      `Bob: genPromise1`,
      `Bob: genPromise2`,
      `Bob: resolveBoth`,
      `Alice: isPromise(resolutionX[0]): true`,
      `Alice: isPromise(resolutionY[0]): true`,
    ];
    expect(vatLogs).toStrictEqual(reference);
  });

  it('promiseCycleMultiCrank: mutually referential promise resolutions across cranks', async () => {
    const [bootstrapResult, vatLogs] = await runTestVats(
      'promise-cycle-vat',
      'promiseCycleMultiCrank',
    );
    expect(bootstrapResult).toBe('done');
    const reference = [
      `Alice: running test promiseCycleMultiCrank`,
      `Bob: genPromise1`,
      `Bob: genPromise2`,
      `Bob: resolve1`,
      `Bob: resolve2`,
      `Alice: isPromise(resolutionX[0]): true`,
      `Alice: isPromise(resolutionY[0]): true`,
    ];
    expect(vatLogs).toStrictEqual(reference);
  });

  it('promiseCrosswise: mutually referential promise resolutions across cranks', async () => {
    const [bootstrapResult, vatLogs] = await runTestVats(
      'promise-crosswise-vat',
      'promiseCrosswise',
    );
    expect(bootstrapResult).toBe('done');
    const reference = [
      `Alice: running test promiseCrosswise`,
      `Bob: genPromise`,
      `Carol: genPromise`,
      `Bob: resolve`,
      `Carol: resolve`,
      `Alice: isPromise(resolutionX[0]): true`,
      `Alice: isPromise(resolutionY[0]): true`,
    ];
    expect(vatLogs).toStrictEqual(reference);
  });

  it('promiseIndirect: resolution of a resolution of a promise', async () => {
    const [bootstrapResult, vatLogs] = await runTestVats(
      'promise-indirect-vat',
      'promiseIndirect',
    );
    expect(bootstrapResult).toBe('done');
    const reference = [
      `Alice: running test promiseIndirect`,
      `Bob: genPromise1`,
      `Bob: genPromise2`,
      `Bob: resolve`,
      `Alice: resolution == hello`,
    ];
    expect(vatLogs).toStrictEqual(reference);
  });

  it('passResult: pass a method result as a parameter', async () => {
    const [bootstrapResult, vatLogs] = await runTestVats(
      'pass-result-vat',
      'passResult',
    );
    expect(bootstrapResult).toStrictEqual(['p1succ', 'p2succ']);
    const reference = [
      `Alice: running test passResult`,
      `Bob: first`,
      `Bob: second`,
      `Alice: first result resolved to Bob's first answer`,
      `Bob: parameter to second resolved to Bob's first answer`,
      `Alice: second result resolved to Bob's second answer`,
    ];
    expect(vatLogs).toStrictEqual(reference);
  });

  it('passResultPromise: pass a method promise as a parameter', async () => {
    const [bootstrapResult, vatLogs] = await runTestVats(
      'pass-result-promise-vat',
      'passResultPromise',
    );
    expect(bootstrapResult).toStrictEqual(['p1succ', 'p2succ']);
    const reference = [
      `Alice: running test passResultPromise`,
      `Bob: first`,
      `Bob: second`,
      `Bob: parameter to second resolved to Bob answers first in second`,
      `Alice: first result resolved to Bob answers first in second`,
      `Alice: second result resolved to Bob's second answer`,
    ];
    expect(vatLogs).toStrictEqual(reference);
  });

  it('resolvePipeline: send to promise resolution', async () => {
    const [bootstrapResult, vatLogs] = await runTestVats(
      'resolve-pipelined-vat',
      'resolvePipelined',
    );
    expect(bootstrapResult).toStrictEqual(['p1succ', 'p2succ']);
    const reference = [
      `Alice: running test resolvePipelined`,
      `Bob: first`,
      `Bob: thing.second`,
      `Alice: first result resolved to [object Alleged: thing]`,
      `Alice: second result resolved to Bob's second answer`,
    ];
    expect(vatLogs).toStrictEqual(reference);
  });
});
