import { describe, it, expect } from 'vitest';

import type { ClusterSnapshot } from './db-parser.ts';
import { parseKernelDB } from './db-parser.ts';

describe('parseKernelDB', () => {
  it('should parse kernel DB entries into structured vat data', () => {
    const entries = [
      { key: 'queue.run.head', value: '6' },
      { key: 'queue.run.tail', value: '6' },
      { key: 'gcActions', value: '[]' },
      { key: 'reapQueue', value: '[]' },
      { key: 'vats.terminated', value: '[]' },
      { key: 'nextObjectId', value: '4' },
      { key: 'nextPromiseId', value: '4' },
      { key: 'nextVatId', value: '4' },
      { key: 'nextRemoteId', value: '1' },
      { key: 'e.nextPromiseId.v1', value: '2' },
      { key: 'e.nextObjectId.v1', value: '3' },
      { key: 'ko1.owner', value: 'v1' },
      { key: 'ko1.refCount', value: '1,1' },
      { key: 'v1.c.ko1', value: 'R o+0' },
      { key: 'v1.c.o+0', value: 'ko1' },
      {
        key: 'vatConfig.v1',
        value:
          '{"bundleSpec":"http://localhost:3000/sample-vat.bundle","parameters":{"name":"Alice"}}',
      },
      { key: 'e.nextPromiseId.v2', value: '2' },
      { key: 'e.nextObjectId.v2', value: '1' },
      { key: 'ko2.owner', value: 'v2' },
      { key: 'ko2.refCount', value: '1,1' },
      { key: 'v2.c.ko2', value: 'R o+0' },
      { key: 'v2.c.o+0', value: 'ko2' },
      {
        key: 'vatConfig.v2',
        value:
          '{"bundleSpec":"http://localhost:3000/sample-vat.bundle","parameters":{"name":"Bob"}}',
      },
      { key: 'e.nextPromiseId.v3', value: '2' },
      { key: 'e.nextObjectId.v3', value: '1' },
      { key: 'ko3.owner', value: 'v3' },
      { key: 'ko3.refCount', value: '1,1' },
      { key: 'v3.c.ko3', value: 'R o+0' },
      { key: 'v3.c.o+0', value: 'ko3' },
      {
        key: 'vatConfig.v3',
        value:
          '{"bundleSpec":"http://localhost:3000/sample-vat.bundle","parameters":{"name":"Carol"}}',
      },
      { key: 'kp1.state', value: 'fulfilled' },
      { key: 'kp1.refCount', value: '1' },
      { key: 'v1.c.ko2', value: 'R o-1' },
      { key: 'v1.c.o-1', value: 'ko2' },
      { key: 'v1.c.ko3', value: 'R o-2' },
      { key: 'v1.c.o-2', value: 'ko3' },
      { key: 'v1.c.kp1', value: 'R p-1' },
      { key: 'v1.c.p-1', value: 'kp1' },
      { key: 'kp2.state', value: 'fulfilled' },
      { key: 'kp2.refCount', value: '1' },
      { key: 'v1.c.kp2', value: 'R p+5' },
      { key: 'v1.c.p+5', value: 'kp2' },
      { key: 'kp3.state', value: 'fulfilled' },
      { key: 'kp3.refCount', value: '1' },
      { key: 'v1.c.kp3', value: 'R p+6' },
      { key: 'v1.c.p+6', value: 'kp3' },
      { key: 'initialized', value: 'true' },
      { key: 'v2.c.kp2', value: 'R p-1' },
      { key: 'v2.c.p-1', value: 'kp2' },
      {
        key: 'kp2.value',
        value:
          '{"body":"#\\"vat Bob got \\"hello\\" from Alice\\"","slots":[]}',
      },
      { key: 'v3.c.kp3', value: 'R p-1' },
      { key: 'v3.c.p-1', value: 'kp3' },
      {
        key: 'kp3.value',
        value:
          '{"body":"#\\"vat Carol got \\"hello\\" from Alice\\"","slots":[]}',
      },
      { key: 'kp1.value', value: '{"body":"#\\"#undefined\\"","slots":[]}' },
      { key: 'kp4.state', value: 'fulfilled' },
      { key: 'kp4.refCount', value: '1' },
      { key: 'v1.c.kp4', value: 'R p-2' },
      { key: 'v1.c.p-2', value: 'kp4' },
      { key: 'ko4.owner', value: 'v1' },
      { key: 'ko4.refCount', value: '3,3' },
      { key: 'v1.c.ko4', value: 'R o+10' },
      { key: 'v1.c.o+10', value: 'ko4' },
      {
        key: 'kp4.value',
        value: '{"body":"#\\"$0.Alleged: SharedObject\\"","slots":["ko4"]}',
      },
      { key: 'v2.c.ko4', value: 'R o-1' },
      { key: 'v2.c.o-1', value: 'ko4' },
    ];

    const result = parseKernelDB(entries);

    const expectedResult: ClusterSnapshot = {
      gcActions: '[]',
      reapQueue: '[]',
      terminatedVats: '[]',
      vats: {
        v1: {
          exportedPromises: [
            {
              eref: 'p+5',
              kref: 'kp2',
              state: 'fulfilled',
              toVats: [],
              value: {
                body: '#"vat Bob got "hello" from Alice"',
                slots: [],
              },
            },
            {
              eref: 'p+6',
              kref: 'kp3',
              state: 'fulfilled',
              toVats: [],
              value: {
                body: '#"vat Carol got "hello" from Alice"',
                slots: [],
              },
            },
          ],
          importedObjects: [
            {
              eref: 'o-1',
              fromVat: 'v2',
              kref: 'ko2',
              refCount: '1,1',
            },
            {
              eref: 'o-2',
              fromVat: 'v3',
              kref: 'ko3',
              refCount: '1,1',
            },
          ],
          importedPromises: [
            {
              eref: 'p-1',
              fromVat: null,
              kref: 'kp1',
              state: 'fulfilled',
              value: {
                body: '#"#undefined"',
                slots: [],
              },
            },
            {
              eref: 'p-2',
              fromVat: null,
              kref: 'kp4',
              state: 'fulfilled',
              value: {
                body: '#"$0.Alleged: SharedObject"',
                slots: [
                  {
                    eref: 'o+10',
                    kref: 'ko4',
                    vat: 'v1',
                  },
                ],
              },
            },
          ],
          overview: {
            bundleSpec: 'http://localhost:3000/sample-vat.bundle',
            name: 'Alice',
          },
          ownedObjects: [
            {
              eref: 'o+0',
              kref: 'ko1',
              refCount: '1,1',
              toVats: [],
            },
            {
              eref: 'o+10',
              kref: 'ko4',
              refCount: '3,3',
              toVats: ['v2'],
            },
          ],
        },
        v2: {
          exportedPromises: [],
          importedObjects: [
            {
              eref: 'o-1',
              fromVat: 'v1',
              kref: 'ko4',
              refCount: '3,3',
            },
          ],
          importedPromises: [
            {
              eref: 'p-1',
              fromVat: 'v1',
              kref: 'kp2',
              state: 'fulfilled',
              value: {
                body: '#"vat Bob got "hello" from Alice"',
                slots: [],
              },
            },
          ],
          overview: {
            bundleSpec: 'http://localhost:3000/sample-vat.bundle',
            name: 'Bob',
          },
          ownedObjects: [
            {
              eref: 'o+0',
              kref: 'ko2',
              refCount: '1,1',
              toVats: ['v1'],
            },
          ],
        },
        v3: {
          exportedPromises: [],
          importedObjects: [],
          importedPromises: [
            {
              eref: 'p-1',
              fromVat: 'v1',
              kref: 'kp3',
              state: 'fulfilled',
              value: {
                body: '#"vat Carol got "hello" from Alice"',
                slots: [],
              },
            },
          ],
          overview: {
            bundleSpec: 'http://localhost:3000/sample-vat.bundle',
            name: 'Carol',
          },
          ownedObjects: [
            {
              eref: 'o+0',
              kref: 'ko3',
              refCount: '1,1',
              toVats: ['v1'],
            },
          ],
        },
      },
    };
    expect(result).toStrictEqual(expectedResult);
  });
});
