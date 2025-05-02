import '@metamask/kernel-shims/endoify';

import { makeCounter } from '@metamask/kernel-utils';
import type { VatId } from '@metamask/ocap-kernel';
import { makePromiseKitMock } from '@ocap/test-utils';
import { describe, expect, it } from 'vitest';
import { Worker as NodeWorker } from 'worker_threads';

import { getTestWorkerFile } from '../get-test-worker.ts';

const { makePromiseKit } = makePromiseKitMock();

describe('NodejsVatWorkerManager', () => {
  let testWorkerFile: string;
  const vatIdCounter = makeCounter();
  const getTestVatId = (): VatId => `v${vatIdCounter()}`;

  describe('hello-world', () => {
    testWorkerFile = getTestWorkerFile('hello-world');
    it('can start in a Node.js worker', async () => {
      const vatId = getTestVatId();
      const worker = new NodeWorker(testWorkerFile, {
        env: {
          NODE_VAT_ID: vatId,
        },
      });
      const { resolve, reject, promise } = makePromiseKit();
      worker.once('online', (error: Error) => {
        if (error) {
          reject(error);
        }
        resolve(vatId);
      });
      expect(await promise).toStrictEqual(vatId);
    });
  });
});
