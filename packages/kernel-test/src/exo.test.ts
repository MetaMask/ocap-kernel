import '@metamask/kernel-shims/endoify';
import type { KernelDatabase } from '@metamask/kernel-store';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import type { KRef } from '@metamask/ocap-kernel';
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
    await waitUntilQuiescent(100);
  });

  it('successfully creates and uses exo objects and scalar stores', async () => {
    expect(bootstrapResult).toBe('exo-test-complete');
    const vatLogs = extractVatLogs(buffered);
    expect(vatLogs).toStrictEqual([
      'ExoTest: initializing state',
      'ExoTest: counter value from baggage: 0',
      'ExoTest: bootstrap()',
      'ExoTest: Created counter with initial value: 10',
      'ExoTest: Incremented counter by 5 to: 15',
      'ExoTest: ERROR: Increment with negative value should have failed',
      'ExoTest: Alice has 1 friends',
      'ExoTest: Added 2 entries to map store',
      'ExoTest: Added 2 entries to set store',
      'ExoTest: Retrieved Alice from map store',
      'ExoTest: Temperature at 25°C = 77°F',
      'ExoTest: After setting to 68°F, celsius is 20°C',
      'ExoTest: SimpleCounter initial value: 0',
      'ExoTest: SimpleCounter after +7: 7',
      'ExoTest: Updated baggage counter to: 7',
    ]);
  }, 30000);

  it('tests scalar store functionality', async () => {
    buffered = '';
    const storeResult = await kernel.queueMessage('ko1', 'testScalarStore', []);
    await waitUntilQuiescent(100);
    expect(kunser(storeResult)).toBe('scalar-store-tests-complete');
    const vatLogs = extractVatLogs(buffered);
    expect(vatLogs).toStrictEqual([
      'ExoTest: Map store size: 3',
      'ExoTest: Map store keys: alice, bob, charlie',
      "ExoTest: Map has 'charlie': true",
      'ExoTest: Set store size: 3',
      'ExoTest: Set has Charlie: true',
    ]);
  }, 30000);

  it('can create and use objects through messaging', async () => {
    buffered = '';
    const counterResult = await kernel.queueMessage('ko1', 'createCounter', [
      42,
    ]);
    await waitUntilQuiescent();
    const counterRef = counterResult.slots[0] as KRef;
    const incrementResult = await kernel.queueMessage(counterRef, 'increment', [
      5,
    ]);
    // Verify the increment result
    expect(kunser(incrementResult)).toBe(47);
    await waitUntilQuiescent();
    const personResult = await kernel.queueMessage('ko1', 'createPerson', [
      'Dave',
      35,
    ]);
    await waitUntilQuiescent();
    const personRef = personResult.slots[0] as KRef;
    await kernel.queueMessage('ko1', 'createOrUpdateInMap', [
      'dave',
      personRef,
    ]);
    await waitUntilQuiescent();

    // Get object from map store
    const retrievedPerson = await kernel.queueMessage('ko1', 'getFromMap', [
      'dave',
    ]);
    await waitUntilQuiescent();
    // Verify the retrieved person object
    expect(kunser(retrievedPerson)).toBe(personRef);
    await kernel.queueMessage('ko1', 'createOrUpdateInMap', [
      'dave',
      personRef,
    ]);
    await waitUntilQuiescent(100);
    const vatLogs = extractVatLogs(buffered);
    // Verify counter was created and used
    expect(vatLogs).toStrictEqual([
      'ExoTest: Created new counter with value: 42',
      'ExoTest: Created person Dave, age 35',
      'ExoTest: Added dave to map, size now: 3',
      'ExoTest: Found dave in map',
      'ExoTest: Updated dave in map',
    ]);
  }, 30000);

  it('tests exoClass type validation and behavior', async () => {
    buffered = '';
    const exoClassResult = await kernel.queueMessage('ko1', 'testExoClass', []);
    await waitUntilQuiescent(100);
    expect(kunser(exoClassResult)).toBe('exoClass-tests-complete');
    const vatLogs = extractVatLogs(buffered);
    expect(vatLogs).toStrictEqual([
      'ExoTest: Counter: 3 + 5 = 8',
      'ExoTest: Counter: 8 - 2 = 6',
      'ExoTest: Successfully caught type error: In "increment" method of (Counter): arg 0: string "foo" - Must be a number',
    ]);
  }, 30000);

  it('tests exoClassKit with multiple facets', async () => {
    buffered = '';
    const exoClassKitResult = await kernel.queueMessage(
      'ko1',
      'testExoClassKit',
      [],
    );
    await waitUntilQuiescent(100);
    expect(kunser(exoClassKitResult)).toBe('exoClassKit-tests-complete');
    const vatLogs = extractVatLogs(buffered);
    expect(vatLogs).toStrictEqual([
      'ExoTest: 20°C = 68°F',
      'ExoTest: 32°F = 0°C',
      'ExoTest: Successfully caught cross-facet error: celsius.getFahrenheit is not a function',
    ]);
  }, 30000);

  it('tests temperature converter through messaging', async () => {
    buffered = '';
    // Create a temperature converter starting at 100°C
    const tempResult = await kernel.queueMessage('ko1', 'createTemperature', [
      100,
    ]);
    await waitUntilQuiescent();
    // Get both facets from the result
    const tempKit = tempResult;
    const celsiusRef = tempKit.slots[0] as KRef;
    const fahrenheitRef = tempKit.slots[1] as KRef;
    // Get the celsius value
    const celsiusResult = await kernel.queueMessage(
      celsiusRef,
      'getCelsius',
      [],
    );
    expect(kunser(celsiusResult)).toBe(100);
    // Get the fahrenheit value
    const fahrenheitResult = await kernel.queueMessage(
      fahrenheitRef,
      'getFahrenheit',
      [],
    );
    expect(kunser(fahrenheitResult)).toBe(212);
    // Change the temperature using the fahrenheit facet
    const setFahrenheitResult = await kernel.queueMessage(
      fahrenheitRef,
      'setFahrenheit',
      [32],
    );
    expect(kunser(setFahrenheitResult)).toBe(32);
    // Verify that the celsius value changed
    const newCelsiusResult = await kernel.queueMessage(
      celsiusRef,
      'getCelsius',
      [],
    );
    expect(kunser(newCelsiusResult)).toBe(0);
    await waitUntilQuiescent(100);
    const vatLogs = extractVatLogs(buffered);
    expect(vatLogs).toContain(
      'ExoTest: Created temperature converter starting at 100°C',
    );
  }, 30000);
});
