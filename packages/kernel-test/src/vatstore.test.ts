import '@ocap/nodejs/endoify-ts';
import type { VatStore, VatCheckpoint } from '@metamask/kernel-store';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import type { ClusterConfig } from '@metamask/ocap-kernel';
import { describe, vi, expect, it } from 'vitest';

import {
  getBundleSpec,
  makeKernel,
  makeMockLogger,
  runTestVats,
} from './utils.ts';

const makeTestSubcluster = (): ClusterConfig => ({
  bootstrap: 'alice',
  forceReset: true,
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

const emptySets: [string, string][] = [];
const emptyDeletes: string[] = [];

// prettier-ignore
const referenceKVUpdates: VatCheckpoint[] = [
  [
    // initVat initializes built-in tables and empty baggage
    [
      ['baggageID', 'o+d6/1'],
      ['idCounters', '{"exportID":10,"collectionID":4,"promiseID":5}'],
      ['kindIDID', '1'],
      ['storeKindIDTable', '{"scalarMapStore":2,"scalarWeakMapStore":3,"scalarSetStore":4,"scalarWeakSetStore":5,"scalarDurableMapStore":6,"scalarDurableWeakMapStore":7,"scalarDurableSetStore":8,"scalarDurableWeakSetStore":9}'],
      ['vc.1.|entryCount', '0'],
      ['vc.1.|nextOrdinal', '1'],
      ['vc.1.|schemata', '{"body":"#{\\"keyShape\\":{\\"#tag\\":\\"match:string\\",\\"payload\\":[]},\\"label\\":\\"baggage\\"}","slots":[]}'],
      ['vc.2.|entryCount', '0'],
      ['vc.2.|nextOrdinal', '1'],
      ['vc.2.|schemata', '{"body":"#{\\"keyShape\\":{\\"#tag\\":\\"match:scalar\\",\\"payload\\":\\"#undefined\\"},\\"label\\":\\"promiseWatcherByKind\\"}","slots":[]}'],
      ['vc.3.|entryCount', '0'],
      ['vc.3.|nextOrdinal', '1'],
      ['vc.3.|schemata', '{"body":"#{\\"keyShape\\":{\\"#tag\\":\\"match:and\\",\\"payload\\":[{\\"#tag\\":\\"match:scalar\\",\\"payload\\":\\"#undefined\\"},{\\"#tag\\":\\"match:string\\",\\"payload\\":[]}]},\\"label\\":\\"watchedPromises\\"}","slots":[]}'],
      ['vom.rc.o+d6/1', '1'],
      ['vom.rc.o+d6/2', '1'],
      ['vom.rc.o+d6/3', '1'],
      ['watchedPromiseTableID', 'o+d6/3'],
      ['watcherTableID', 'o+d6/2'],
    ],
    emptyDeletes,
  ],
  // execution of 'bootstrap' initializes baggage, setting "thing" to 1 and
  // "goAway" to the string "now you see me", (and thus the baggage entry count
  // to 2).
  [
    [
      ['idCounters', '{"exportID":10,"collectionID":4,"promiseID":7}'],
      ['vc.1.sgoAway', '{"body":"#\\"now you see me\\"","slots":[]}'],
      ['vc.1.sthing', '{"body":"#1","slots":[]}'],
      ['vc.1.|entryCount', '2'],
    ],
    emptyDeletes,
  ],
  // first 'bump' (from Bob) increments "thing" to 2
  [
    [
      ['vc.1.sthing', '{"body":"#2","slots":[]}'],
    ],
    emptyDeletes,
  ],
  // notification of 'go' result from Bob changes nothing
  [emptySets, emptyDeletes],
  // second 'bump' (from Carol) increments "thing" to 3
  [
    [
      ['vc.1.sthing', '{"body":"#3","slots":[]}'],
    ],
    emptyDeletes,
  ],
  // notification of 'go' result from Carol allows 'bootstrap' method to
  // complete, deleting "goAway" from baggage and dropping the baggage entry
  // count to 1.  Sending 'loopback' consumes a promise ID.
  [
    [
      ['idCounters', '{"exportID":10,"collectionID":4,"promiseID":8}'],
      ['vc.1.|entryCount', '1'],
    ],
    ['vc.1.sgoAway'],
  ],
  // notification of 'loopback' result changes nothing
  [emptySets, emptyDeletes],
];

describe('exercise vatstore', async () => {
  // TODO: fix flaky
  it('exercise vatstore', { retry: 3 }, async () => {
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
            (sets: [string, string][], deletes: string[]): void => {
              kvUpdates.push([sets, deletes]);
              origUpdateKVData(sets, deletes);
            },
          );
        }
        return result;
      },
    );
    const kernel = await makeKernel(kernelDatabase, true, makeMockLogger());
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
      '{"exportID":10,"collectionID":4,"promiseID":8}',
    );
    expect(vsKv.get('vc.1.sthing')).toBe('{"body":"#3","slots":[]}');
    expect(vsKv.get('vc.1.|entryCount')).toBe('1');
    expect(normalize(kvUpdates)).toStrictEqual(normalize(referenceKVUpdates));
  });
});

/**
 * Normalize an array of vat checkpoints to a comparable format.
 *
 * @param checkpoints - The vat checkpoints to normalize.
 * @returns The normalized vat checkpoints.
 */
function normalize(
  checkpoints: VatCheckpoint[],
): [Record<string, string>, string[]][] {
  return checkpoints.map((checkpoint) => {
    const [sets, deletes] = checkpoint;
    return [
      sets.reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {}),
      deletes.sort(),
    ];
  });
}
