import '@ocap/shims/endoify';
import type { ClusterConfig, VatCheckpoint } from '@ocap/kernel';
import { Kernel, kunser } from '@ocap/kernel';
import type { VatStore } from '@ocap/store';
import { makeSQLKernelDatabase } from '@ocap/store/sqlite/nodejs';
import { waitUntilQuiescent } from '@ocap/utils';
import deepEqual from 'fast-deep-equal';
import { describe, vi, expect, it } from 'vitest';

import { getBundleSpec, makeKernel } from './utils.ts';

const makeTestSubcluster = (): ClusterConfig => ({
  bootstrap: 'alice',
  forceReset: true,
  bundles: null,
  vats: {
    alice: {
      bundleSpec: getBundleSpec('vatstore-vat'),
      parameters: {
        name: 'Alice',
      },
    },
    bob: {
      bundleSpec: getBundleSpec('vatstore-vat'),
      parameters: {
        name: 'Bob',
      },
    },
    carol: {
      bundleSpec: getBundleSpec('vatstore-vat'),
      parameters: {
        name: 'Carol',
      },
    },
  },
});

/**
 * Run the set of test vats.
 *
 * @param kernel - The kernel to run in.
 * @param config - Subcluster configuration telling what vats to run.
 *
 * @returns the bootstrap result.
 */
async function runTestVats(
  kernel: Kernel,
  config: ClusterConfig,
): Promise<unknown> {
  const bootstrapResultRaw = await kernel.launchSubcluster(config);

  await waitUntilQuiescent();

  if (bootstrapResultRaw === undefined) {
    throw Error(`this can't happen but eslint is stupid`);
  }
  return kunser(bootstrapResultRaw);
}

const emptyMap = new Map();
const emptySet = new Set();

// prettier-ignore
const referenceKVUpdates = [
  [
    // initVat initializes built-in tables and empty baggage
    new Map([
      ['baggageID', 'o+d6/1'],
      ['idCounters', '{"exportID":10,"collectionID":5,"promiseID":5}'],
      ['kindIDID', '1'],
      ['storeKindIDTable', '{"scalarMapStore":2,"scalarWeakMapStore":3,"scalarSetStore":4,"scalarWeakSetStore":5,"scalarDurableMapStore":6,"scalarDurableWeakMapStore":7,"scalarDurableSetStore":8,"scalarDurableWeakSetStore":9}'],
      ['vc.1.|entryCount', '0'],
      ['vc.1.|nextOrdinal', '1'],
      ['vc.1.|schemata', '{"body":"#{\\"keyShape\\":{\\"#tag\\":\\"match:string\\",\\"payload\\":[]},\\"label\\":\\"baggage\\"}","slots":[]}'],
      ['vc.2.|entryCount', '0'],
      ['vc.2.|nextOrdinal', '1'],
      ['vc.2.|schemata', '{"body":"#{\\"keyShape\\":{\\"#tag\\":\\"match:scalar\\",\\"payload\\":\\"#undefined\\"},\\"label\\":\\"promiseRegistrations\\"}","slots":[]}'],
      ['vc.3.|entryCount', '0'],
      ['vc.3.|nextOrdinal', '1'],
      ['vc.3.|schemata', '{"body":"#{\\"keyShape\\":{\\"#tag\\":\\"match:scalar\\",\\"payload\\":\\"#undefined\\"},\\"label\\":\\"promiseWatcherByKind\\"}","slots":[]}'],
      ['vc.4.|entryCount', '0'],
      ['vc.4.|nextOrdinal', '1'],
      ['vc.4.|schemata', '{"body":"#{\\"keyShape\\":{\\"#tag\\":\\"match:and\\",\\"payload\\":[{\\"#tag\\":\\"match:scalar\\",\\"payload\\":\\"#undefined\\"},{\\"#tag\\":\\"match:string\\",\\"payload\\":[]}]},\\"label\\":\\"watchedPromises\\"}","slots":[]}'],
      ['vom.rc.o+d6/1', '1'],
      ['vom.rc.o+d6/3', '1'],
      ['vom.rc.o+d6/4', '1'],
      ['watchedPromiseTableID', 'o+d6/4'],
      ['watcherTableID', 'o+d6/3'],
    ]),
    emptySet,
  ],
  // execution of 'bootstrap' initializes baggage, setting "thing" to 1 and
  // "goAway" to the string "now you see me", (and thus the baggage entry count
  // to 2).
  [
    new Map([
      ['idCounters', '{"exportID":10,"collectionID":5,"promiseID":7}'],
      ['vc.1.sgoAway', '{"body":"#\\"now you see me\\"","slots":[]}'],
      ['vc.1.sthing', '{"body":"#1","slots":[]}'],
      ['vc.1.|entryCount', '2'],
    ]),
    emptySet,
  ],
  // first 'bump' (from Bob) increments "thing" to 2
  [
    new Map([
      ['vc.1.sthing', '{"body":"#2","slots":[]}'],
    ]),
    emptySet,
  ],
  // notification of 'go' result from Bob changes nothing
  [emptyMap, emptySet],
  // second 'bump' (from Carol) increments "thing" to 3
  [
    new Map([
      ['vc.1.sthing', '{"body":"#3","slots":[]}'],
    ]),
    emptySet,
  ],
  // notification of 'go' result from Carol allows 'bootstrap' method to
  // complete, deleting "goAway" from baggage and dropping the baggage entry
  // count to 1.  Sending 'loopback' consumes a promise ID.
  [
    new Map([
      ['idCounters', '{"exportID":10,"collectionID":5,"promiseID":8}'],
      ['vc.1.|entryCount', '1'],
    ]),
    new Set(['vc.1.sgoAway']),
  ],
  // notification of 'loopback' result changes nothing
  [emptyMap, emptySet],
]

describe('exercise vatstore', async () => {
  it('exercise vatstore', async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const origMakeVatStore = kernelDatabase.makeVatStore;
    const kvUpdates: VatCheckpoint[] = [];
    vi.spyOn(kernelDatabase, 'makeVatStore').mockImplementation(
      (vatID: string): VatStore => {
        const result = origMakeVatStore(vatID);
        if (vatID === 'v1') {
          const origUpdateKVData = result.updateKVData;
          vi.spyOn(result, 'updateKVData').mockImplementation(
            (sets: Map<string, string>, deletes: Set<string>): void => {
              kvUpdates.push([sets, deletes]);
              origUpdateKVData(sets, deletes);
            },
          );
        }
        return result;
      },
    );
    const kernel = await makeKernel(kernelDatabase, true);
    await runTestVats(kernel, makeTestSubcluster());

    type VSRecord = { key: string; value: string };
    const vsContents = kernelDatabase.executeQuery(
      `SELECT key, value from kv_vatStore where vatID = 'v1'`,
    ) as VSRecord[];
    const vsKv = new Map<string, string>();
    for (const entry of vsContents) {
      vsKv.set(entry.key, entry.value);
    }
    expect(vsKv.get('idCounters')).toBe(
      '{"exportID":10,"collectionID":5,"promiseID":8}',
    );
    expect(vsKv.get('vc.1.sthing')).toBe('{"body":"#3","slots":[]}');
    expect(vsKv.get('vc.1.|entryCount')).toBe('1');

    expect(deepEqual(kvUpdates, referenceKVUpdates)).toBe(true);
  }, 30000);
});
