/* eslint-disable import/no-unassigned-import */
import './lockdown.js';
/* eslint-enable import/no-unassigned-import */
import { Logger } from '@metamask/logger';
import type { JsonRpcCall } from '@metamask/kernel-utils';
import { MessagePortDuplexStream } from '@metamask/streams/browser';
import { isJsonRpcCall } from '@metamask/kernel-utils';
import type { JsonRpcResponse } from '@metamask/utils';

import { makeKernel } from '@ocap/cf-worker';
import { makeD1KernelDatabase } from '@metamask/kernel-store/sqlite/d1';
import type { D1Database } from '@metamask/kernel-store/sqlite/d1';
import { kunser, makeKernelStore } from '@metamask/ocap-kernel';
import { counterBundleUri } from './bundles.ts';
""
// no-op

export type Env = {
  DB: D1Database;
};

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    const logger = new Logger('cf-worker-example');

    try {
      // Initialize D1 schema and create database (write-behind store loads initial snapshot)
      console.log('initializing d1 database');
      const database = await makeD1KernelDatabase({ db: env.DB, logger });
      console.log('d1 database initialized');

      // Link the Worker (controller) to the kernel over a MessageChannel
      const channel = new MessageChannel();
      const controllerPort = channel.port1;
      const kernelPort = channel.port2;

      // Build the controller-side stream first (starts listening)
      const controllerStreamPromise = MessagePortDuplexStream.make<
        JsonRpcResponse,
        JsonRpcCall
      >(controllerPort);

      // Start the kernel on the other end of the channel
      console.log('starting kernel');
      const kernelPromise = makeKernel({ port: kernelPort, logger, database });

      // Wait for both to be ready
      const [controllerStream, kernel] = await Promise.all([
        controllerStreamPromise,
        kernelPromise,
      ]);
      console.log('kernel ready');

      // Launch counter vat subcluster directly (not via RPC!)
      console.log('launching counter vat subcluster...');
      let bootstrapMessage: unknown = null;
      let counterRootRef: string | null = null;
      let vatCountBefore: unknown = null;
      let vatCountAfter: unknown = null;

      try {
        // Launch the subcluster
        const bootstrapResult = await kernel.launchSubcluster({
          bootstrap: 'counter',
          forceReset: false,
          vats: {
            counter: {
              bundleSpec: counterBundleUri,
              parameters: {
                name: 'CFWorkerCounter',
              },
            },
          },
        });
        
        // Deserialize the bootstrap result to get the actual return value
        if (bootstrapResult) {
          bootstrapMessage = kunser(bootstrapResult);
          console.log('bootstrap result:', bootstrapMessage);
        }

        // Get the root object reference using KernelStore
        const kernelStore = makeKernelStore(database);
        counterRootRef = kernelStore.getRootObject('v1') as string;
        console.log('counter root ref:', counterRootRef);

        if (counterRootRef) {
          // Get the current count
          const getCountResult = await kernel.queueMessage(counterRootRef, 'getCount', []);
          vatCountBefore = kunser(getCountResult);
          console.log('current count:', vatCountBefore);

          // Increment the counter
          console.log('incrementing counter...');
          const incrementRawResult = await kernel.queueMessage(counterRootRef, 'increment', [1]);
          vatCountAfter = kunser(incrementRawResult);
          console.log('new count after increment:', vatCountAfter);
        }
      } catch (error) {
        console.error('error during vat operations:', error);
        bootstrapMessage = { error: String(error), stack: error instanceof Error ? error.stack : undefined };
      }

      // Test database persistence by reading/writing a simple counter
      const counterKey = 'cf-worker-request-count';
      const dbCountStr = database.kernelKVStore.get(counterKey);
      const nextCount = dbCountStr ? parseInt(dbCountStr, 10) + 1 : 1;
      database.kernelKVStore.set(counterKey, String(nextCount));
      console.log(`request count: ${nextCount}`);

      await controllerStream.return();
      try {
        controllerPort.close();
      } catch {
        // ignore
      }
      console.log('controller stream returned');

      return new Response(JSON.stringify({ 
        bootstrap: bootstrapMessage,
        counterRef: counterRootRef,
        vatCountBefore: vatCountBefore,
        vatCountAfter: vatCountAfter,
        requestCount: nextCount,
        message: 'Counter vat launched and incremented!',
        timestamp: new Date().toISOString()
      }, null, 2), {
        headers: { 'content-type': 'application/json' },
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ 
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, null, 2), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
  },
};


