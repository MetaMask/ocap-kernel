import '@ocap/test-utils/mock-endoify';
import { VatAlreadyExistsError, VatNotFoundError } from '@ocap/errors';
import { VatWorkerServiceCommandMethod } from '@ocap/kernel';
import type { VatConfig, VatId, VatWorkerServiceCommand } from '@ocap/kernel';
import type { PostMessageTarget } from '@ocap/streams';
import { delay } from '@ocap/test-utils';
import { TestDuplexStream } from '@ocap/test-utils/streams';
import type { Logger } from '@ocap/utils';
import { makeLogger } from '@ocap/utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

import { ExtensionVatWorkerServer } from './VatWorkerServer.js';
import type { VatWorker, VatWorkerServerStream } from './VatWorkerServer.js';

vi.mock('@endo/promise-kit', async () => {
  const { makePromiseKitMock } = await import('@ocap/test-utils');
  return makePromiseKitMock();
});
vi.mock('@ocap/kernel', () => ({
  VatWorkerServiceCommandMethod: {
    launch: 'launch',
    terminate: 'terminate',
    terminateAll: 'terminateAll',
  },
}));

const makeVatConfig = (sourceSpec = 'bogus.js'): VatConfig => ({
  sourceSpec,
});

const makeMessageEvent = (
  messageId: `m${number}`,
  payload: VatWorkerServiceCommand['payload'],
): MessageEvent =>
  new MessageEvent('message', { data: { id: messageId, payload } });

const makeLaunchMessageEvent = (
  messageId: `m${number}`,
  vatId: VatId,
  sourceSpec = 'bogus.js',
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: VatWorkerServiceCommandMethod.launch,
    params: { vatId, vatConfig: makeVatConfig(sourceSpec) },
  });

const makeTerminateMessageEvent = (
  messageId: `m${number}`,
  vatId: VatId,
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: VatWorkerServiceCommandMethod.terminate,
    params: { vatId },
  });

const makeTerminateAllMessageEvent = (messageId: `m${number}`): MessageEvent =>
  makeMessageEvent(messageId, {
    method: VatWorkerServiceCommandMethod.terminateAll,
    params: null,
  });

describe('ExtensionVatWorkerServer', () => {
  it('constructs with default logger', async () => {
    const stream = await TestDuplexStream.make(() => undefined);
    expect(
      new ExtensionVatWorkerServer(
        stream as unknown as VatWorkerServerStream,
        () => ({}) as unknown as VatWorker,
      ),
    ).toBeDefined();
  });

  it('constructs using static factory method', () => {
    const server = ExtensionVatWorkerServer.make(
      {
        postMessage: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as PostMessageTarget,
      () => ({}) as unknown as VatWorker,
    );
    expect(server).toBeDefined();
  });

  describe('message handling', () => {
    let workers: ReturnType<typeof makeMockVatWorker>[] = [];
    let stream: TestDuplexStream;
    let logger: Logger;
    let server: ExtensionVatWorkerServer;

    const makeMockVatWorker = (
      _id: string,
    ): {
      launch: Mock;
      terminate: Mock;
    } => {
      const worker = {
        launch: vi.fn().mockResolvedValue([
          // Mock MessagePort
          {} as MessagePort,
          // Mock window/iframe reference
          {},
        ]),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      workers.push(worker);
      return worker;
    };

    beforeEach(async () => {
      workers = [];
      logger = makeLogger('[test server]');
      stream = await TestDuplexStream.make(() => undefined);
      server = new ExtensionVatWorkerServer(
        stream as unknown as VatWorkerServerStream,
        makeMockVatWorker,
        logger,
      );
      server.start().catch((error) => {
        throw error;
      });
    });

    it('logs an error for unexpected methods', async () => {
      const errorSpy = vi.spyOn(logger, 'error');
      // @ts-expect-error Destructive testing.
      await stream.receiveInput(makeMessageEvent('m0', { method: 'foo' }));
      await delay(10);

      expect(errorSpy).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalledWith(
        'Received message with unexpected method',
        'foo',
      );
    });

    describe('launch', () => {
      it('launches a vat', async () => {
        const vatId = 'v0';
        await stream.receiveInput(makeLaunchMessageEvent('m0', vatId));
        await delay(10);

        expect(workers).toHaveLength(1);
        expect(workers[0]?.launch).toHaveBeenCalledOnce();
        expect(workers[0]?.launch).toHaveBeenCalledWith(makeVatConfig());
      });

      it('logs error if a vat with the same id already exists', async () => {
        const errorSpy = vi.spyOn(logger, 'error');
        await stream.receiveInput(makeLaunchMessageEvent('m0', 'v0'));
        await stream.receiveInput(makeLaunchMessageEvent('m1', 'v0'));
        await delay(10);

        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy).toHaveBeenCalledWith(
          `Error handling ${VatWorkerServiceCommandMethod.launch} for vatId v0`,
          new VatAlreadyExistsError('v0'),
        );
      });
    });

    describe('terminate', () => {
      it('terminates a vat', async () => {
        const vatId = 'v0';
        await stream.receiveInput(makeLaunchMessageEvent('m0', vatId));
        await delay(10);

        expect(workers).toHaveLength(1);
        expect(workers[0]?.terminate).not.toHaveBeenCalled();

        await stream.receiveInput(makeTerminateMessageEvent('m1', vatId));
        await delay(10);

        expect(workers).toHaveLength(1);
        expect(workers[0]?.terminate).toHaveBeenCalledOnce();
        expect(workers[0]?.terminate).toHaveBeenCalledWith();
      });

      it('logs error if a vat with the specified id does not exist', async () => {
        const errorSpy = vi.spyOn(logger, 'error');
        await stream.receiveInput(makeTerminateMessageEvent('m0', 'v0'));
        await delay(10);

        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy).toHaveBeenCalledWith(
          `Error handling ${VatWorkerServiceCommandMethod.terminate} for vatId v0`,
          new VatNotFoundError('v0'),
        );
      });

      it('logs error if a vat fails to terminate', async () => {
        const errorSpy = vi.spyOn(logger, 'error');
        const vatId = 'v0';
        const vatNotFoundError = new VatNotFoundError(vatId);

        await stream.receiveInput(makeLaunchMessageEvent('m0', vatId));
        await delay(10);

        expect(workers).toHaveLength(1);
        workers[0]?.terminate.mockRejectedValue(vatNotFoundError);

        await stream.receiveInput(makeTerminateMessageEvent('m1', vatId));
        await delay(10);

        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy).toHaveBeenCalledWith(
          `Error handling ${VatWorkerServiceCommandMethod.terminate} for vatId ${vatId}`,
          vatNotFoundError,
        );
      });
    });

    describe('terminateAll', () => {
      it('terminates all vats', async () => {
        await stream.receiveInput(
          makeLaunchMessageEvent('m0', 'v0', 'bogus1.js'),
        );
        await stream.receiveInput(
          makeLaunchMessageEvent('m1', 'v1', 'bogus2.js'),
        );
        await delay(10);

        expect(workers).toHaveLength(2);
        expect(workers[0]?.terminate).not.toHaveBeenCalled();
        expect(workers[1]?.terminate).not.toHaveBeenCalled();

        await stream.receiveInput(makeTerminateAllMessageEvent('m2'));
        await delay(10);

        expect(workers).toHaveLength(2);
        expect(workers[0]?.terminate).toHaveBeenCalledOnce();
        expect(workers[1]?.terminate).toHaveBeenCalledOnce();
      });

      it('logs error if a vat fails to terminate', async () => {
        const errorSpy = vi.spyOn(logger, 'error');
        const vatId = 'v0';
        const vatNotFoundError = new VatNotFoundError(vatId);

        await stream.receiveInput(makeLaunchMessageEvent('m0', vatId));
        await delay(10);

        expect(workers).toHaveLength(1);
        workers[0]?.terminate.mockRejectedValue(vatNotFoundError);

        await stream.receiveInput(makeTerminateAllMessageEvent('m1'));
        await delay(10);

        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy).toHaveBeenCalledWith(
          `Error handling ${VatWorkerServiceCommandMethod.terminateAll} for vatId ${vatId}`,
          vatNotFoundError,
        );
      });
    });
  });
});
