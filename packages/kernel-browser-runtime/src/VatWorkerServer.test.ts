import {
  VatAlreadyExistsError,
  VatNotFoundError,
} from '@metamask/kernel-errors';
import { delay } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type { VatConfig, VatId } from '@metamask/ocap-kernel';
import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest } from '@metamask/utils';
import { makeMockMessageTarget } from '@ocap/test-utils';
import { TestDuplexStream } from '@ocap/test-utils/streams';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';

import { VatWorkerServer } from './VatWorkerServer.ts';
import type { VatWorker, VatWorkerServiceStream } from './VatWorkerServer.ts';

vi.mock('@metamask/ocap-kernel', () => ({
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
  payload: Pick<JsonRpcRequest, 'method' | 'params'>,
): MessageEvent<JsonRpcRequest> =>
  new MessageEvent('message', {
    data: { ...payload, id: messageId, jsonrpc: '2.0' },
  });

const makeLaunchMessageEvent = (
  messageId: `m${number}`,
  vatId: VatId,
  sourceSpec = 'bogus.js',
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'launch',
    params: { vatId, vatConfig: makeVatConfig(sourceSpec) },
  });

const makeTerminateMessageEvent = (
  messageId: `m${number}`,
  vatId: VatId,
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'terminate',
    params: { vatId },
  });

const makeTerminateAllMessageEvent = (messageId: `m${number}`): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'terminateAll',
    params: [],
  });

describe('VatWorkerServer', () => {
  let cleanup: (() => Promise<void>)[] = [];

  beforeEach(() => {
    cleanup = [];
  });

  afterEach(async () => {
    for (const cleanupFn of cleanup) {
      await cleanupFn();
    }
  });

  // Add cleanup function for each worker/stream created
  const addCleanup = (fn: () => Promise<void>): void => {
    cleanup.push(fn);
  };

  it('constructs with default logger', async () => {
    const stream = await TestDuplexStream.make(() => undefined);
    await stream.synchronize();
    const server = new VatWorkerServer(
      stream as unknown as VatWorkerServiceStream,
      () => ({}) as unknown as VatWorker,
    );
    expect(server).toBeDefined();
  });

  it('constructs using static factory method', async () => {
    const server = await VatWorkerServer.make(
      makeMockMessageTarget(),
      () => ({}) as unknown as VatWorker,
    );
    expect(server).toBeDefined();
  });

  describe('message handling', () => {
    let workers: ReturnType<typeof makeMockVatWorker>[] = [];
    let stream: TestDuplexStream;
    let logger: Logger;

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
      logger = new Logger('test-server');
      stream = await TestDuplexStream.make(() => undefined);
      await stream.synchronize();
      // eslint-disable-next-line no-new
      new VatWorkerServer(
        stream as unknown as VatWorkerServiceStream,
        makeMockVatWorker,
        logger,
      );

      addCleanup(async () => {
        await stream.return?.();
      });
    });

    it('logs an error for unexpected methods', async () => {
      const errorSpy = vi.spyOn(logger, 'error');
      await stream.receiveInput(makeMessageEvent('m0', { method: 'foo' }));
      await delay(10);

      expect(errorSpy).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalledWith(
        'Error handling "foo" request:',
        rpcErrors.methodNotFound(),
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
          'Error handling "launch" request:',
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
          'Error handling "terminate" request:',
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
          'Error handling "terminate" request:',
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
          'Error handling "terminateAll" request:',
          vatNotFoundError,
        );
      });
    });
  });
});
