import '@ocap/shims/endoify';
import { makePromiseKit } from '@endo/promise-kit';
import type {
  KernelCommand,
  KernelCommandReply,
  ClusterConfig,
  VatCheckpoint,
} from '@ocap/kernel';
import { Kernel } from '@ocap/kernel';
import type { KernelDatabase, VatStore } from '@ocap/store';
import { makeSQLKernelDatabase } from '@ocap/store/sqlite/nodejs';
import { NodeWorkerDuplexStream } from '@ocap/streams';
import {
  MessagePort as NodeMessagePort,
  MessageChannel as NodeMessageChannel,
} from 'node:worker_threads';
import { describe, vi, expect, it } from 'vitest';

import { kunser } from '../../kernel/src/kernel-marshal.ts';
import { NodejsVatWorkerService } from '../../nodejs/src/kernel/VatWorkerService.ts';

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
  vats: {
    alice: {
      bundleSpec: bundleSpec('vatstore-vat'),
      parameters: {
        name: 'Alice',
      },
    },
    bob: {
      bundleSpec: bundleSpec('vatstore-vat'),
      parameters: {
        name: 'Bob',
      },
    },
    carol: {
      bundleSpec: bundleSpec('vatstore-vat'),
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

  const { promise, resolve } = makePromiseKit();
  setTimeout(() => resolve(null), 0);
  await promise;
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
  // count to 1.
  [
    new Map([['vc.1.|entryCount', '1']]),
    new Set(['vc.1.sgoAway']),
  ]
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
    await runTestVats(kernel, testSubcluster);

    type VSRecord = { key: string; value: string };
    const vsContents = kernelDatabase.executeQuery(
      `SELECT key, value from kv_vatStore where vatID = 'v1'`,
    ) as VSRecord[];
    const vsKv = new Map<string, string>();
    for (const entry of vsContents) {
      vsKv.set(entry.key, entry.value);
    }
    expect(vsKv.get('idCounters')).toBe(
      '{"exportID":10,"collectionID":5,"promiseID":7}',
    );
    expect(vsKv.get('vc.1.sthing')).toBe('{"body":"#3","slots":[]}');
    expect(vsKv.get('vc.1.|entryCount')).toBe('1');

    expect(kvUpdates).toStrictEqual(referenceKVUpdates);
  }, 30000);
});
