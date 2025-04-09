import '@ocap/shims/endoify';
import { Kernel, kunser } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';
import { makeSQLKernelDatabase } from '@ocap/store/sqlite/nodejs';
import { waitUntilQuiescent } from '@ocap/utils';
import { beforeEach, describe, expect, it } from 'vitest';

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

const testSubcluster = {
  bootstrap: 'exoTest',
  forceReset: true,
  vats: {
    exoTest: {
      bundleSpec: getBundleSpec('exo-vat'),
      parameters: {
        name: 'ExoTest',
      },
    },
  },
};

describe('virtual objects functionality', async () => {
  let kernel: Kernel;
  let kernelDatabase: KernelDatabase;
  let bootstrapResult: unknown;

  beforeEach(async () => {
    kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    kernel = await makeKernel(kernelDatabase, true);
    buffered = '';
    bootstrapResult = await runTestVats(kernel, testSubcluster);
    await waitUntilQuiescent();
  });

  it('successfully creates and uses exo objects and scalar stores', async () => {
    expect(bootstrapResult).toBe('exo-test-complete');
    const vatLogs = extractVatLogs(buffered);
    // Verify exo objects were created and used
    expect(vatLogs).toContain('ExoTest: initializing state');
    expect(vatLogs).toContain('ExoTest: counter value from baggage: 0');
    expect(vatLogs).toContain(
      '::> ExoTest: Created counter with initial value: 10',
    );
    expect(vatLogs).toContain('::> ExoTest: Incremented counter by 5 to: 15');
    // Verify scalar map store functionality
    expect(vatLogs).toContain('::> ExoTest: Added 2 entries to map store');
    expect(vatLogs).toContain('::> ExoTest: Retrieved Alice from map store');
    // Verify scalar set store functionality
    expect(vatLogs).toContain('::> ExoTest: Added 2 entries to set store');
    // Verify exo validation works
    expect(vatLogs).toContain(
      '::> ExoTest: Successfully caught error on negative increment',
    );
    // Verify exoClassKit temperature converter
    expect(vatLogs).toContain('::> ExoTest: Temperature at 25°C =');
    expect(vatLogs).toContain('::> ExoTest: After setting to 68°F, celsius is');
    // Verify makeExo direct instance
    expect(vatLogs).toContain('::> ExoTest: SimpleCounter initial value:');
    expect(vatLogs).toContain('::> ExoTest: SimpleCounter after +7:');
  }, 30000);

  it('preserves state across vat restarts', async () => {
    // Restart the vat
    await kernel.restartVat('v1');
    buffered = '';
    // Create and send a message to the root
    await kernel.queueMessageFromKernel('ko1', 'resume', []);
    await waitUntilQuiescent();
    const vatLogs = extractVatLogs(buffered);
    // Verify state was preserved
    expect(vatLogs).toContain('ExoTest: state already initialized');
    expect(vatLogs).toContain('ExoTest: Counter value after restart: 7');
    // Verify stores persistence
    expect(vatLogs).toContain('::> ExoTest: Map store size after restart: 2');
    expect(vatLogs).toContain('::> ExoTest: Set store size after restart: 2');
  }, 30000);

  it('tests scalar store functionality', async () => {
    const storeResult = await kernel.queueMessageFromKernel(
      'ko1',
      'testScalarStore',
      [],
    );
    await waitUntilQuiescent();
    const vatLogs = extractVatLogs(buffered);
    // Verify test result
    expect(kunser(storeResult)).toBe('scalar-store-tests-complete');
    // Verify map store operations
    expect(vatLogs).toContain('::> ExoTest: Map store size:');
    expect(vatLogs).toContain('::> ExoTest: Map store keys:');
    expect(vatLogs).toContain("::> ExoTest: Map has 'charlie': true");
    // Verify set store operations
    expect(vatLogs).toContain('::> ExoTest: Set store size:');
    expect(vatLogs).toContain('::> ExoTest: Set has Charlie: true');
  }, 30000);

  it('can create and use objects through messaging', async () => {
    // Create a counter through messaging
    const counterResult = await kernel.queueMessageFromKernel(
      'ko1',
      'createCounter',
      [42],
    );
    await waitUntilQuiescent();

    // Use the returned counter object
    const counterRef = JSON.parse(counterResult.body).slots[0];
    const incrementResult = await kernel.queueMessageFromKernel(
      counterRef,
      'increment',
      [5],
    );
    await waitUntilQuiescent();

    // Add object to map store
    const personResult = await kernel.queueMessageFromKernel(
      'ko1',
      'createPerson',
      ['Dave', 35],
    );
    await waitUntilQuiescent();

    const personRef = JSON.parse(personResult.body).slots[0];
    await kernel.queueMessageFromKernel('ko1', 'addToMap', ['dave', personRef]);
    await waitUntilQuiescent();

    // Get object from map store
    const retrievedPerson = await kernel.queueMessageFromKernel(
      'ko1',
      'getFromMap',
      ['dave'],
    );
    await waitUntilQuiescent();
    const vatLogs = extractVatLogs(buffered);

    // Verify counter was created and used
    expect(vatLogs).toContain(
      '::> ExoTest: Created new counter with value: 42',
    );
    expect(JSON.parse(incrementResult.body).body).toBe(47);
    // Verify map store operations through messaging
    expect(vatLogs).toContain('::> ExoTest: Created person Dave, age 35');
    expect(vatLogs).toContain('::> ExoTest: Added dave to map');
    expect(vatLogs).toContain('::> ExoTest: Found dave in map');
    // Verify the retrieved person object
    const personSlot = JSON.parse(retrievedPerson.body).slots[0];
    expect(personSlot).toBeDefined();
  }, 30000);
});
