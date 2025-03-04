import type { VatId, VatWorkerServiceReply, VatConfig } from '@ocap/kernel';
import { VatWorkerServiceCommandMethod } from '@ocap/kernel';
import type { PostMessageTarget } from '@ocap/streams';
import {
  TestDuplexStream,
  TrackedTestDuplexStream,
} from '@ocap/test-utils/streams';
import type { Logger } from '@ocap/utils';
import { delay, makeLogger } from '@ocap/utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ExtensionVatWorkerClient } from './VatWorkerClient.ts';

vi.mock('@ocap/kernel', async () => ({
  isVatCommandReply: vi.fn(() => true),
  VatWorkerServiceCommandMethod: {
    launch: 'launch',
    terminate: 'terminate',
    terminateAll: 'terminateAll',
  },
}));

vi.mock('@ocap/streams', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const { TrackedTestDuplexStream } = await import('@ocap/test-utils/streams');

  class MockStream extends TrackedTestDuplexStream {
    constructor() {
      super(() => undefined);
      this.completeSynchronization().catch(() => undefined);
    }
  }

  return {
    ...(await importOriginal()),
    MessagePortDuplexStream: MockStream,
    PostMessageDuplexStream: MockStream,
  };
});

const makeVatConfig = (sourceSpec: string = 'bogus.js'): VatConfig => ({
  sourceSpec,
});

const makeMessageEvent = (
  messageId: `m${number}`,
  payload: VatWorkerServiceReply['payload'],
  port?: MessagePort,
): MessageEvent =>
  new MessageEvent('message', {
    data: { id: messageId, payload },
    ports: port ? [port] : [],
  });

const makeLaunchReply = (messageId: `m${number}`, vatId: VatId): MessageEvent =>
  makeMessageEvent(
    messageId,
    {
      method: VatWorkerServiceCommandMethod.launch,
      params: { vatId },
    },
    new MessageChannel().port1,
  );

const makeTerminateReply = (
  messageId: `m${number}`,
  vatId: VatId,
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: VatWorkerServiceCommandMethod.terminate,
    params: { vatId },
  });

const makeTerminateAllReply = (messageId: `m${number}`): MessageEvent =>
  makeMessageEvent(messageId, {
    method: VatWorkerServiceCommandMethod.terminateAll,
    params: null,
  });

describe('ExtensionVatWorkerClient', () => {
  it('constructs with default logger', () => {
    const [client] = ExtensionVatWorkerClient.make(
      {} as unknown as PostMessageTarget,
    );
    expect(client).toBeDefined();
  });

  it('constructs using static factory method', () => {
    const [client] = ExtensionVatWorkerClient.make({
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as PostMessageTarget);
    expect(client).toBeDefined();
  });

  describe('message handling', () => {
    let clientLogger: Logger;
    let client: ExtensionVatWorkerClient;
    let clientStop: Promise<void>;

    const receiveInput = (event: MessageEvent<unknown>): void => {
      TrackedTestDuplexStream.instances[0]
        ?.receiveInput(event)
        .catch((error) => {
          throw error;
        });
    };

    beforeEach(async () => {
      TrackedTestDuplexStream.instances.length = 0;
      clientLogger = makeLogger('[test client]');
      [client, clientStop] = ExtensionVatWorkerClient.make(
        {} as unknown as PostMessageTarget,
        clientLogger,
      );
      clientStop.catch((error) => {
        throw error;
      });
    });

    it('logs error for unexpected methods', async () => {
      const errorSpy = vi.spyOn(clientLogger, 'error');
      client.launch('v0', makeVatConfig()).catch((error) => {
        throw error;
      });
      // @ts-expect-error Destructive testing.
      receiveInput(makeMessageEvent('m1', { method: 'foo' }));
      await delay(10);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        'Received message with unexpected method',
        'foo',
      );
    });

    it('rejects pending promises for error replies', async () => {
      const resultP = client.launch('v0', makeVatConfig());

      receiveInput(
        makeMessageEvent('m1', {
          method: VatWorkerServiceCommandMethod.launch,
          params: { vatId: 'v0', error: new Error('foo') },
        }),
      );

      await expect(resultP).rejects.toThrow('foo');
    });

    it.each`
      method
      ${VatWorkerServiceCommandMethod.launch}
      ${VatWorkerServiceCommandMethod.terminate}
    `(
      "calls logger.error when receiving a $method reply it wasn't waiting for",
      async ({ method }) => {
        const errorSpy = vi.spyOn(clientLogger, 'error');
        const unexpectedReply = makeMessageEvent('m9', {
          method,
          params: { vatId: 'v0' },
        });

        receiveInput(unexpectedReply);
        await delay(10);

        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy).toHaveBeenLastCalledWith(
          'Received unexpected reply',
          unexpectedReply.data,
        );
      },
    );

    describe('launch', () => {
      it('resolves with a duplex stream when receiving a launch reply', async () => {
        const vatId: VatId = 'v0';
        const vatConfig = makeVatConfig();
        const result = client.launch(vatId, vatConfig);

        await delay(10);
        receiveInput(makeLaunchReply('m1', vatId));

        // @ocap/streams is mocked
        expect(await result).toBeInstanceOf(TestDuplexStream);
      });

      it('logs error when receiving reply without a port', async () => {
        const errorSpy = vi.spyOn(clientLogger, 'error');
        const vatId: VatId = 'v0';
        const vatConfig = makeVatConfig();
        client.launch(vatId, vatConfig).catch((error) => {
          throw error;
        });
        const reply = makeMessageEvent('m1', {
          method: VatWorkerServiceCommandMethod.launch,
          params: { vatId },
        });

        receiveInput(reply);
        await delay(10);

        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy.mock.lastCall?.[0]).toBe(
          'Expected a port with message reply',
        );
        expect(errorSpy.mock.lastCall?.[1]).toBe(reply);
      });
    });

    describe('terminate', () => {
      it('resolves when receiving a terminate reply', async () => {
        const result = client.terminate('v0');
        receiveInput(makeTerminateReply('m1', 'v0'));
        await delay(10);

        expect(await result).toBeUndefined();
      });
    });

    describe('terminateAll', () => {
      it('resolves when receiving a terminateAll reply', async () => {
        const result = client.terminateAll();
        receiveInput(makeTerminateAllReply('m1'));
        await delay(10);

        expect(await result).toBeUndefined();
      });
    });
  });
});
