import '@metamask/kernel-shims/endoify';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { describe, expect, it } from 'vitest';

import {
  getBundleSpec,
  makeKernel,
  makeTestLogger,
  runResume,
  runTestVats,
  sortLogs,
  extractTestLogs,
} from './utils.ts';

const testSubcluster = {
  bootstrap: 'alice',
  forceReset: true,
  vats: {
    alice: {
      bundleSpec: getBundleSpec('resume-vat'),
      parameters: {
        name: 'Alice',
      },
    },
    bob: {
      bundleSpec: getBundleSpec('resume-vat'),
      parameters: {
        name: 'Bob',
      },
    },
    carol: {
      bundleSpec: getBundleSpec('resume-vat'),
      parameters: {
        name: 'Carol',
      },
    },
  },
};

const bootstrapReference = [
  `Alice: saving name`,
  `Alice: start count: 1`,
  `Bob: saving name`,
  `Bob: start count: 1`,
  `Carol: saving name`,
  `Carol: start count: 1`,
  `Alice: bootstrap()`,
  `Bob: intro()`,
  `Carol: intro()`,
  `Bob: greet('hello from Alice')`,
  `Carol: greet('hello from Alice')`,
  `Alice: Bob answers greeting: 'Bob returns your greeting 'hello from Alice''`,
  `Alice: Carol answers greeting: 'Carol returns your greeting 'hello from Alice''`,
  `Alice: end bootstrap`,
];
const aliceRestartReference = [
  `Alice: saved name is Alice`,
  `Alice: start count: 2`,
];
const aliceResumeReference = [
  `Alice: resume()`,
  `Alice: resumed vat is bootstrap`,
  `Bob: greet('hello again from Alice')`,
  `Carol: greet('hello again from Alice')`,
  `Alice: Bob answers greeting: 'Bob returns your greeting 'hello again from Alice''`,
  `Alice: Carol answers greeting: 'Carol returns your greeting 'hello again from Alice''`,
  `Alice: end resume`,
];
// prettier-ignore
const bobRestartReference = [
  `Bob: saved name is Bob`,
  `Bob: start count: 2`,
];
const bobResumeReference = [
  `Bob: resume()`,
  `Bob: resumed vat is not bootstrap`,
  `Alice: greet('hello boot vat from Bob')`,
  `Bob: boot vat returns greeting with 'Alice returns your greeting 'hello boot vat from Bob''`,
  `Bob: end resume`,
];
const carolRestartReference = [
  `Carol: saved name is Carol`,
  `Carol: start count: 2`,
];
const carolResumeReference = [
  `Carol: resume()`,
  `Carol: resumed vat is not bootstrap`,
  `Alice: greet('hello boot vat from Carol')`,
  `Carol: boot vat returns greeting with 'Alice returns your greeting 'hello boot vat from Carol''`,
  `Carol: end resume`,
];
const reference = sortLogs([
  ...bootstrapReference,
  ...aliceRestartReference,
  ...bobRestartReference,
  ...carolRestartReference,
  ...aliceResumeReference,
  ...bobResumeReference,
  ...carolResumeReference,
]);

describe('restarting vats', { timeout: 30_000 }, async () => {
  it('exercise restart vats individually', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const { logger, entries } = makeTestLogger();
    const kernel = await makeKernel(kernelDatabase, true, logger);
    const bootstrapResult = await runTestVats(kernel, testSubcluster);
    expect(bootstrapResult).toBe('bootstrap Alice');
    await waitUntilQuiescent();
    await kernel.restartVat('v1');
    await kernel.restartVat('v2');
    await kernel.restartVat('v3');
    const resumeResultA = await runResume(kernel, 'ko1');
    expect(resumeResultA).toBe('resume Alice');
    const resumeResultB = await runResume(kernel, 'ko2');
    expect(resumeResultB).toBe('resume Bob');
    const resumeResultC = await runResume(kernel, 'ko3');
    expect(resumeResultC).toBe('resume Carol');

    await waitUntilQuiescent(1000);
    const vatLogs = extractTestLogs(entries, 'v1', 'v2', 'v3');
    expect(sortLogs(vatLogs)).toStrictEqual(reference);
  });

  it('exercise restart kernel', { timeout: 30_000 }, async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const { logger: logger1, entries: entries1 } = makeTestLogger();
    const kernel1 = await makeKernel(kernelDatabase, true, logger1);
    const bootstrapResult = await runTestVats(kernel1, testSubcluster);
    expect(bootstrapResult).toBe('bootstrap Alice');
    await waitUntilQuiescent();
    const { logger: logger2, entries: entries2 } = makeTestLogger();
    const kernel2 = await makeKernel(kernelDatabase, false, logger2);
    const resumeResultA = await runResume(kernel2, 'ko1');
    expect(resumeResultA).toBe('resume Alice');
    const resumeResultB = await runResume(kernel2, 'ko2');
    expect(resumeResultB).toBe('resume Bob');
    const resumeResultC = await runResume(kernel2, 'ko3');
    expect(resumeResultC).toBe('resume Carol');
    await waitUntilQuiescent(1000);
    const vatLogs = extractTestLogs(
      [...entries1, ...entries2],
      'v1',
      'v2',
      'v3',
    );
    expect(sortLogs(vatLogs)).toStrictEqual(reference);
  });
});
