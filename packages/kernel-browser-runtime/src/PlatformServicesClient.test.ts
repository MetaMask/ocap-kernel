import { delay, stringify } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type { VatId, VatConfig } from '@metamask/ocap-kernel';
import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcResponse } from '@metamask/utils';
import { makeMockMessageTarget } from '@ocap/repo-tools/test-utils';
import { TestDuplexStream } from '@ocap/repo-tools/test-utils/streams';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { PlatformServicesClientStream } from './PlatformServicesClient.ts';
import { PlatformServicesClient } from './PlatformServicesClient.ts';

vi.mock('@metamask/streams/browser', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const { TestDuplexStream } = await import(
    '@ocap/repo-tools/test-utils/streams'
  );

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

type MessageEventWithPayload = MessageEvent & {
  payload:
    | {
        id: string;
        error: unknown;
      }
    | undefined;
};

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

describe('PlatformServicesClient', () => {
  it('constructs with default logger', async () => {
    const stream = await TestDuplexStream.make(() => undefined);
    await stream.synchronize();
    const client = new PlatformServicesClient(
      stream as unknown as PlatformServicesClientStream,
    );
    expect(client).toBeDefined();
  });

  it('constructs using static factory method', async () => {
    const client = await PlatformServicesClient.make(makeMockMessageTarget());
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(PlatformServicesClient);
  });

  describe('message handling', () => {
    let stream: TestDuplexStream;
    let clientLogger: Logger;
    let client: PlatformServicesClient;

    beforeEach(async () => {
      stream = await TestDuplexStream.make(() => undefined);
      await stream.synchronize();
      clientLogger = new Logger('test-client');
      client = new PlatformServicesClient(
        stream as unknown as PlatformServicesClientStream,
        clientLogger,
      );
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
        await newStream.synchronize();
        const newClient = new PlatformServicesClient(
          newStream as unknown as PlatformServicesClientStream,
        );

        // Call launch before starting the client
        const launchPromise = newClient.launch('v0', makeVatConfig());

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

    describe('remote communications', () => {
      describe('initializeRemoteComms', () => {
        it('sends initializeRemoteComms request and resolves', async () => {
          const remoteHandler = vi.fn(async () => 'response');
          const result = client.initializeRemoteComms(
            '0xabcd',
            ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
            remoteHandler,
          );
          await stream.receiveInput(makeNullReply('m1'));
          expect(await result).toBeUndefined();
        });
      });

      describe('sendRemoteMessage', () => {
        it('sends message to remote peer via RPC', async () => {
          const result = client.sendRemoteMessage('peer-456', 'hello', [
            '/dns4/relay.example/tcp/443/wss/p2p/relayPeer',
          ]);
          await delay(10);
          await stream.receiveInput(makeNullReply('m1'));
          expect(await result).toBeUndefined();
        });

        it('works with empty hints array', async () => {
          const result = client.sendRemoteMessage('peer-789', 'goodbye');
          await delay(10);
          await stream.receiveInput(makeNullReply('m1'));
          expect(await result).toBeUndefined();
        });
      });

      describe('stopRemoteComms', () => {
        it('sends stopRemoteComms request and resolves', async () => {
          const result = client.stopRemoteComms();
          await delay(10);
          await stream.receiveInput(makeNullReply('m1'));
          expect(await result).toBeUndefined();
        });
      });

      describe('closeConnection', () => {
        it('sends closeConnection request and resolves', async () => {
          const result = client.closeConnection('peer-123');
          await delay(10);
          await stream.receiveInput(makeNullReply('m1'));
          expect(await result).toBeUndefined();
        });
      });

      describe('reconnectPeer', () => {
        it('sends reconnectPeer request with hints and resolves', async () => {
          const result = client.reconnectPeer('peer-456', [
            '/dns4/relay.example/tcp/443/wss/p2p/relayPeer',
          ]);
          await delay(10);
          await stream.receiveInput(makeNullReply('m1'));
          expect(await result).toBeUndefined();
        });

        it('sends reconnectPeer request with empty hints and resolves', async () => {
          const result = client.reconnectPeer('peer-789');
          await delay(10);
          await stream.receiveInput(makeNullReply('m1'));
          expect(await result).toBeUndefined();
        });
      });

      describe('remoteDeliver', () => {
        it('throws error when handler not set', async () => {
          // Client without initialized remote comms
          const outputs: MessageEventWithPayload[] = [];
          const newStream = await TestDuplexStream.make((message) => {
            outputs.push(message as unknown as MessageEventWithPayload);
          });
          // eslint-disable-next-line no-new -- test setup
          new PlatformServicesClient(
            newStream as unknown as PlatformServicesClientStream,
          );
          // Simulate remoteDeliver request
          await newStream.receiveInput(
            new MessageEvent('message', {
              data: {
                id: 'm1',
                jsonrpc: '2.0',
                method: 'remoteDeliver',
                params: { from: 'peer-999', message: 'test' },
              },
            }),
          );
          await delay(10);
          // Should have sent error response
          const errorResponse = outputs.find(
            (message) =>
              message.payload?.id === 'm1' && 'error' in message.payload,
          );
          expect(errorResponse).toBeDefined();
        });
      });
    });
  });
});
