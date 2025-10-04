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
      const [controllerStream] = await Promise.all([
        controllerStreamPromise,
        kernelPromise,
      ]);
      console.log('kernel ready');

      // Send ping to test kernel is responding
      console.log('sending ping request');
      const pingId = '1';
      await controllerStream.write({ 
        jsonrpc: '2.0', 
        id: pingId, 
        method: 'ping',
        params: []
      });
      console.log('ping request sent');

      // Read ping response with timeout
      let pingResult: unknown = null;
      const timeoutMs = 5000;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Ping timeout')), timeoutMs);
      });

      try {
        const responsePromise = (async () => {
          for await (const message of controllerStream) {
            console.log('received message:', JSON.stringify(message));
            if ('id' in message && message.id === pingId) {
              if ('result' in message) {
                pingResult = message.result;
              } else if ('error' in message) {
                pingResult = { error: message.error };
              }
              break;
            }
          }
        })();

        await Promise.race([responsePromise, timeoutPromise]);
        console.log('ping response received:', pingResult);
      } catch (error) {
        console.error('error waiting for ping response:', error);
        pingResult = { error: String(error) };
      }

      // Test database persistence by reading/writing a simple counter
      const counterKey = 'cf-worker-request-count';
      const currentCount = database.kernelKVStore.get(counterKey);
      const nextCount = currentCount ? parseInt(currentCount, 10) + 1 : 1;
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
        ping: pingResult,
        requestCount: nextCount,
        message: 'Kernel is running with D1 persistence!',
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


