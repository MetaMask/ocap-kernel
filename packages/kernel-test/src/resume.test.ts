import '@ocap/shims/endoify';
import { makePromiseKit } from '@endo/promise-kit';
import type {
  KernelCommand,
  KernelCommandReply,
  ClusterConfig,
} from '@ocap/kernel';
import { Kernel } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';
import { makeSQLKernelDatabase } from '@ocap/store/sqlite/nodejs';
import { NodeWorkerDuplexStream } from '@ocap/streams';
import {
  MessagePort as NodeMessagePort,
  MessageChannel as NodeMessageChannel,
} from 'node:worker_threads';
import { describe, expect, it } from 'vitest';

import { kunser } from '../../kernel/src/kernel-marshal.ts';
import { NodejsVatWorkerService } from '../../nodejs/src/kernel/VatWorkerService.ts';

const origStdoutWrite = process.stdout.write.bind(process.stdout);
let buffered: string = '';
// @ts-expect-error Some type def used by lint is just wrong (compiler likes it ok, but lint whines)
process.stdout.write = (buffer: string, encoding, callback): void => {
  buffered += buffer;
  origStdoutWrite(buffer, encoding, callback);
};

/**
 * Construct a bundle path URL from a bundle name.
 *
 * @param bundleName - The name of the bundle.
 *
 * @returns a path string for the named bundle.
 */
function bundleSpec(bundleName: string): string {
  return new URL(`${bundleName}.bundle`, import.meta.url).toString();
}

const testSubcluster = {
  bootstrap: 'alice',
  forceReset: true,
  bundles: null, // grrrrr
  vats: {
    alice: {
      bundleSpec: bundleSpec('resume-vat'),
      parameters: {
        name: 'Alice',
      },
    },
    bob: {
      bundleSpec: bundleSpec('resume-vat'),
      parameters: {
        name: 'Bob',
      },
    },
    carol: {
      bundleSpec: bundleSpec('resume-vat'),
      parameters: {
        name: 'Carol',
      },
    },
  },
};

/**
 * Handle all the boilerplate to set up a kernel instance.
 *
 * @param kernelDatabase - The database that will hold the persistent state.
 * @param resetStorage - If true, reset the database as part of setting up.
 *
 * @returns the new kernel instance.
 */
async function makeKernel(
  kernelDatabase: KernelDatabase,
  resetStorage: boolean,
): Promise<Kernel> {
  const kernelPort: NodeMessagePort = new NodeMessageChannel().port1;
  const nodeStream = new NodeWorkerDuplexStream<
    KernelCommand,
    KernelCommandReply
  >(kernelPort);
  const vatWorkerClient = new NodejsVatWorkerService({});
  const kernel = await Kernel.make(
    nodeStream,
    vatWorkerClient,
    kernelDatabase,
    {
      resetStorage,
    },
  );
  return kernel;
}

/**
 * Take a pass through the JavaScript run loop.
 *
 * @param delay - Optional delay (in ms) to wait for things to catch up.
 */
async function waitForQuiescence(delay: number = 0): Promise<void> {
  const { promise, resolve } = makePromiseKit();
  setTimeout(() => resolve(null), delay);
  await promise;
}

/**
 * De-interleave various vats' output to squeeze out interprocess I/O
 * non-determinism in CI.
 *
 * @param logs - An array of log lines.
 *
 * @returns `logs` sorted by vat.
 */
function sortLogs(logs: string[]): string[] {
  logs.sort((a: string, b: string): number => {
    const colonA = a.indexOf(':');
    if (colonA < 0) {
      return 0;
    }
    const prefixA = a.substring(0, colonA);
    const colonB = b.indexOf(':');
    if (colonB < 0) {
      return 0;
    }
    const prefixB = b.substring(0, colonB);
    return prefixA.localeCompare(prefixB);
  });
  return logs;
}

/**
 * Convert a raw output buffer into a list of lines suitable for examination.
 *
 * @param buffer - The raw buffer to convert.
 *
 * @returns the relevant contents of `buffer`, massaged for use.
 */
function extractVatLogs(buffer: string): string[] {
  const result = buffer
    .split('\n')
    .filter((line: string) => line.startsWith('::> '))
    .map((line: string) => line.slice(4));
  return sortLogs(result);
}

/**
 * Bootstrap the set of test vats.
 *
 * @param kernel - The kernel to run in.
 * @param config - Subcluster configuration telling what vats to run.
 *
 * @returns the bootstrap result.
 */
async function runBootstrap(
  kernel: Kernel,
  config: ClusterConfig,
): Promise<unknown> {
  const bootstrapResultRaw = await kernel.launchSubcluster(config);
  if (bootstrapResultRaw === undefined) {
    throw Error(`this can't happen but eslint is stupid`);
  }
  return kunser(bootstrapResultRaw);
}

/**
 * Send the `resume message to the root of one of the test vats.
 *
 * @param kernel - Our kernel.
 * @param rootRef - KRef of the object to which the message is sent.
 *
 * @returns the result returned from `resume`.
 */
async function runResume(kernel: Kernel, rootRef: string): Promise<unknown> {
  const resumeResultRaw = await kernel.queueMessageFromKernel(
    rootRef,
    'resume',
    [],
  );
  return kunser(resumeResultRaw);
}

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

describe('restarting vats', async () => {
  it('exercise restart vats individually', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const kernel = await makeKernel(kernelDatabase, true);

    buffered = '';
    const bootstrapResult = await runBootstrap(kernel, testSubcluster);
    expect(bootstrapResult).toBe('bootstrap Alice');

    await waitForQuiescence();
    await kernel.restartVat('v1');
    await kernel.restartVat('v2');
    await kernel.restartVat('v3');

    const resumeResultA = await runResume(kernel, 'ko1');
    expect(resumeResultA).toBe('resume Alice');
    const resumeResultB = await runResume(kernel, 'ko2');
    expect(resumeResultB).toBe('resume Bob');
    const resumeResultC = await runResume(kernel, 'ko3');
    expect(resumeResultC).toBe('resume Carol');

    await waitForQuiescence(1000);
    const vatLogs = extractVatLogs(buffered);
    expect(vatLogs).toStrictEqual(reference);
  }, 30000);

  it('exercise restart kernel', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const kernel1 = await makeKernel(kernelDatabase, true);

    buffered = '';
    const bootstrapResult = await runBootstrap(kernel1, testSubcluster);
    expect(bootstrapResult).toBe('bootstrap Alice');
    await waitForQuiescence();

    const kernel2 = await makeKernel(kernelDatabase, false);

    const resumeResultA = await runResume(kernel2, 'ko1');
    expect(resumeResultA).toBe('resume Alice');
    const resumeResultB = await runResume(kernel2, 'ko2');
    expect(resumeResultB).toBe('resume Bob');
    const resumeResultC = await runResume(kernel2, 'ko3');
    expect(resumeResultC).toBe('resume Carol');

    await waitForQuiescence(1000);
    const vatLogs = extractVatLogs(buffered);
    expect(vatLogs).toStrictEqual(reference);
  }, 30000);
});
