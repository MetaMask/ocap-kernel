import { makePromiseKit } from '@endo/promise-kit';
import { isJsonRpcMessage } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type {
  PlatformServices,
  VatId,
  RemoteMessageHandler,
  SendRemoteMessage,
  VatConfig,
} from '@metamask/ocap-kernel';
import { initNetwork } from '@metamask/ocap-kernel';
import { MessagePortDuplexStream } from '@metamask/streams/browser';
import type { DuplexStream } from '@metamask/streams';

import { makeCfWorkerVatSupervisor } from '../vat/make-supervisor.ts';

export class CfWorkerPlatformServices implements PlatformServices {
  readonly #logger: Logger;

  #sendRemoteMessageFunc: SendRemoteMessage | null = null;

  #remoteMessageHandler: RemoteMessageHandler | undefined = undefined;

  workers = new Map<
    VatId,
    {
      stream: DuplexStream<JsonRpcMessage, JsonRpcMessage>;
      port: MessagePort;
      terminate: () => Promise<void>;
    }
  >();

  constructor(args?: { logger?: Logger | undefined }) {
    this.#logger = args?.logger ?? new Logger('cf-worker-platform-services');
  }

  async launch(
    vatId: VatId,
    _vatConfig: VatConfig,
  ): Promise<DuplexStream<JsonRpcMessage, JsonRpcMessage>> {
    if (this.workers.has(vatId)) {
      throw new Error(`Vat already exists: ${vatId}`);
    }

    const { promise, resolve, reject } =
      makePromiseKit<DuplexStream<JsonRpcMessage, JsonRpcMessage>>();

    const channel = new MessageChannel();
    const kernelPort = channel.port1;
    const vatPort = channel.port2;

    // Create the kernel-facing stream
    const streamPromise = MessagePortDuplexStream.make<
      JsonRpcMessage,
      JsonRpcMessage
    >(kernelPort, isJsonRpcMessage);

    // Start the supervisor on the other end
    void (async () => {
      try {
        const { logger: vatLogger } = await makeCfWorkerVatSupervisor(
          vatId,
          'cf-worker-vat',
          vatPort,
          {},
        );
        this.#logger.debug('launched vat', vatId);
        vatLogger.debug('vat supervisor started');
      } catch (error) {
        reject(error as Error);
      }
    })();

    const stream = await streamPromise;
    this.workers.set(vatId, {
      stream,
      port: kernelPort,
      terminate: async () => {
        await stream.return();
        try {
          kernelPort.close();
        } catch {
          // ignore
        }
      },
    });
    resolve(stream);

    return promise;
  }

  async terminate(vatId: VatId): Promise<void> {
    const workerEntry = this.workers.get(vatId);
    if (!workerEntry) {
      throw new Error(`No worker found for vatId ${vatId}`);
    }
    await workerEntry.terminate();
    this.workers.delete(vatId);
  }

  async terminateAll(): Promise<void> {
    for (const vatId of this.workers.keys()) {
      await this.terminate(vatId);
    }
  }

  async sendRemoteMessage(to: string, message: string): Promise<void> {
    if (!this.#sendRemoteMessageFunc) {
      throw Error('remote comms not initialized');
    }
    await this.#sendRemoteMessageFunc(to, message);
  }

  async #handleRemoteMessage(from: string, message: string): Promise<string> {
    if (!this.#remoteMessageHandler) {
      throw Error('remote comms not initialized');
    }
    const possibleReply = await this.#remoteMessageHandler(from, message);
    if (possibleReply !== '') {
      await this.sendRemoteMessage(from, possibleReply);
    }
    return '';
  }

  async initializeRemoteComms(
    keySeed: string,
    knownRelays: string[],
    remoteMessageHandler: (from: string, message: string) => Promise<string>,
  ): Promise<void> {
    if (this.#sendRemoteMessageFunc) {
      throw Error('remote comms already initialized');
    }
    this.#remoteMessageHandler = remoteMessageHandler;
    this.#sendRemoteMessageFunc = await initNetwork(
      keySeed,
      knownRelays,
      this.#handleRemoteMessage.bind(this),
    );
  }
}
harden(CfWorkerPlatformServices);


