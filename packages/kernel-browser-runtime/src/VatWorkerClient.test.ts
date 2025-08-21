import { delay, stringify } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type { VatId, VatConfig } from '@metamask/ocap-kernel';
import { rpcErrors } from '@metamask/rpc-errors';
import type { PostMessageTarget } from '@metamask/streams/browser';
import type { JsonRpcResponse } from '@metamask/utils';
import { TestDuplexStream } from '@ocap/test-utils/streams';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { VatWorkerClientStream } from './VatWorkerClient.ts';
import { VatWorkerClient } from './VatWorkerClient.ts';

vi.mock('@metamask/streams/browser', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const { TestDuplexStream } = await import('@ocap/test-utils/streams');

  class MockStream extends TestDuplexStream {
    constructor() {
      super(() => undefined);
    }
  }

  return {
    ...(await importOriginal()),
    MessagePortDuplexStream: MockStream,
  };
});

const makeVatConfig = (sourceSpec: string = 'bogus.js'): VatConfig => ({
  sourceSpec,
});

const makeMessageEvent = <Response extends Partial<JsonRpcResponse>>(
  messageId: `m${number}`,
  payload: Response,
  port?: MessagePort,
): MessageEvent<Response> =>
  new MessageEvent('message', {
    data: { ...payload, id: messageId, jsonrpc: '2.0' },
    ports: port ? [port] : [],
  });

const makeLaunchReply = (messageId: `m${number}`): MessageEvent =>
  makeMessageEvent(
    messageId,
    {
      result: null,
    },
    new MessageChannel().port1,
  );

const makeNullReply = (messageId: `m${number}`): MessageEvent =>
  makeMessageEvent(messageId, {
    result: null,
  });

describe('VatWorkerClient', () => {
  it('constructs with default logger', () => {
    const client = new VatWorkerClient({} as unknown as VatWorkerClientStream);
    expect(client).toBeDefined();
  });

  it('constructs using static factory method', () => {
    const client = VatWorkerClient.make({
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as PostMessageTarget);
    expect(client).toBeDefined();
  });

  describe('waitUntilReady', () => {
    it('resolves when start is called', async () => {
      const stream = await TestDuplexStream.make(() => undefined);
      const client = new VatWorkerClient(
        stream as unknown as VatWorkerClientStream,
      );

      // Start the client (but don't wait for it to complete)
      client.start().catch((error) => {
        throw error;
      });

      // waitUntilReady should resolve once synchronize completes
      expect(await client.waitUntilReady()).toBeUndefined();
    });

    it('can be called multiple times and returns same promise', async () => {
      const stream = await TestDuplexStream.make(() => undefined);
      const client = new VatWorkerClient(
        stream as unknown as VatWorkerClientStream,
      );

      const ready1 = client.waitUntilReady();
      const ready2 = client.waitUntilReady();

      // Should be the same promise instance
      expect(ready1).toStrictEqual(ready2);

      client.start().catch((error) => {
        throw error;
      });

      expect(await ready1).toBeUndefined();
      expect(await ready2).toBeUndefined();
    });

    it('resolves after synchronize but before drain completes', async () => {
      const stream = await TestDuplexStream.make(() => undefined);
      const client = new VatWorkerClient(
        stream as unknown as VatWorkerClientStream,
      );

      let readyResolved = false;

      const readyPromise = client
        .waitUntilReady()
        .then(() => (readyResolved = true))
        .catch(() => {
          // ignore
        });

      // Start will never complete because drain runs indefinitely
      const startPromise = client.start();

      // Don't wait for start to complete
      startPromise.catch((error) => {
        throw error;
      });

      // Wait for ready to resolve
      await readyPromise;

      // Ready should be resolved
      expect(readyResolved).toBe(true);
    });

    it('can be awaited before start is called', async () => {
      const stream = await TestDuplexStream.make(() => undefined);
      const client = new VatWorkerClient(
        stream as unknown as VatWorkerClientStream,
      );

      // Call waitUntilReady before start
      const readyPromise = client.waitUntilReady();

      // Give it a moment to ensure it doesn't resolve prematurely
      await delay(10);

      // Should still be pending
      let resolved = false;
      readyPromise
        .then(() => (resolved = true))
        .catch(() => {
          // ignore
        });
      await delay(10);
      expect(resolved).toBe(false);

      // Now start the client
      client.start().catch((error) => {
        throw error;
      });

      // Now it should resolve
      expect(await readyPromise).toBeUndefined();
    });
  });

  describe('message handling', () => {
    let stream: TestDuplexStream;
    let clientLogger: Logger;
    let client: VatWorkerClient;

    beforeEach(async () => {
      stream = await TestDuplexStream.make(() => undefined);
      clientLogger = new Logger('test-client');
      client = new VatWorkerClient(
        stream as unknown as VatWorkerClientStream,
        clientLogger,
      );
      const startPromise = client.start();
      // Wait for client to be ready before running tests
      await client.waitUntilReady();
      // Don't wait for start to complete (it runs indefinitely)
      startPromise.catch((error) => {
        throw error;
      });
    });

    it('rejects pending promises for error replies', async () => {
      const resultP = client.launch('v0', makeVatConfig());

      await stream.receiveInput(
        makeMessageEvent('m1', {
          error: rpcErrors.internal('foo'),
        }),
      );

      await expect(resultP).rejects.toThrow('foo');
    });

    it('calls logger.debug when receiving an unexpected reply', async () => {
      const debugSpy = vi.spyOn(clientLogger, 'debug');
      const unexpectedReply = makeNullReply('m9');

      await stream.receiveInput(unexpectedReply);
      await delay(10);

      expect(debugSpy).toHaveBeenCalledOnce();
      expect(debugSpy).toHaveBeenLastCalledWith(
        'Received response with unexpected id "m9".',
      );
    });

    describe('launch', () => {
      it('resolves with a duplex stream when receiving a launch reply', async () => {
        const vatId: VatId = 'v0';
        const vatConfig = makeVatConfig();
        const result = client.launch(vatId, vatConfig);

        await delay(10);
        await stream.receiveInput(makeLaunchReply('m1'));

        // @metamask/streams is mocked
        expect(await result).toBeInstanceOf(TestDuplexStream);
      });

      it('throws an error when receiving reply without a port', async () => {
        const vatId: VatId = 'v0';
        const vatConfig = makeVatConfig();
        const launchP = client.launch(vatId, vatConfig);
        const reply = makeNullReply('m1');

        await stream.receiveInput(reply);
        await expect(launchP).rejects.toThrow(
          `No port found for launch of: ${stringify({ vatId, vatConfig })}`,
        );
      });

      it('can be called before client is started', async () => {
        const newStream = await TestDuplexStream.make(() => undefined);
        const newClient = new VatWorkerClient(
          newStream as unknown as VatWorkerClientStream,
        );

        // Call launch before starting the client
        const launchPromise = newClient.launch('v0', makeVatConfig());

        // Start the client
        const startPromise = newClient.start();
        startPromise.catch((error) => {
          throw error;
        });

        // Wait for client to be ready
        await newClient.waitUntilReady();

        // Now send the launch reply
        await delay(10);
        await newStream.receiveInput(makeLaunchReply('m1'));

        // Launch should resolve successfully
        expect(await launchPromise).toBeInstanceOf(TestDuplexStream);
      });
    });

    describe('terminate', () => {
      it('resolves when receiving a terminate reply', async () => {
        const result = client.terminate('v0');
        await stream.receiveInput(makeNullReply('m1'));
        await delay(10);

        expect(await result).toBeUndefined();
      });
    });

    describe('terminateAll', () => {
      it('resolves when receiving a terminateAll reply', async () => {
        const result = client.terminateAll();
        await stream.receiveInput(makeNullReply('m1'));
        await delay(10);

        expect(await result).toBeUndefined();
      });
    });
  });
});
