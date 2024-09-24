import { makeCapTP } from '@endo/captp';
import type {
  StreamPair,
  StreamEnvelope,
  VatMessage,
  CapTpMessage,
  StreamEnvelopeHandler,
  WrappedVatMessage,
} from '@ocap/streams';
import {
  makeMessagePortStreamPair,
  Command,
  wrapCapTp,
  wrapStreamCommand,
  makeStreamEnvelopeHandler,
} from '@ocap/streams';

import { stringifyResult } from './utils/stringifyResult.js';

export class Supervisor {
  readonly id: string;

  readonly streams: StreamPair<StreamEnvelope>;

  readonly #defaultCompartment = new Compartment({ URL });

  readonly #streamEnvelopeHandler: StreamEnvelopeHandler;

  readonly #bootstrap: unknown;

  #capTp?: ReturnType<typeof makeCapTP>;

  /**
   * Create a new Supervisor.
   *
   * @param id - The id of the Supervisor.
   * @param port - The MessagePort to use for communication.
   * @param bootstrap - The bootstrap object to use for CapTp initialization.
   */
  constructor(id: string, port: MessagePort, bootstrap?: unknown) {
    this.id = id;
    this.#bootstrap = bootstrap;
    this.streams = makeMessagePortStreamPair<StreamEnvelope>(port);

    this.#streamEnvelopeHandler = makeStreamEnvelopeHandler(
      {
        command: this.handleMessage.bind(this),
        capTp: async (content) => this.#capTp?.dispatch(content),
      },
      (error) => console.error('Supervisor stream error:', error),
    );
  }

  /**
   * Initializes the Supervisor.
   *
   */
  async init(): Promise<void> {
    for await (const rawMessage of this.streams.reader) {
      console.debug('iframe received message', rawMessage);
      await this.#streamEnvelopeHandler.handle(rawMessage);
    }

    await this.streams.return();
    throw new Error('MessagePortReader ended unexpectedly.');
  }

  /**
   * Handle a message from the parent window.
   *
   * @param wrappedMessage - The wrapped message to handle.
   * @param wrappedMessage.id - The id of the message.
   * @param wrappedMessage.message - The message to handle.
   */
  async handleMessage({ id, message }: WrappedVatMessage): Promise<void> {
    switch (message.type) {
      case Command.Ping: {
        await this.replyToMessage(id, {
          type: Command.Ping,
          data: 'pong',
        });
        break;
      }
      case Command.CapTpInit: {
        this.#capTp = makeCapTP(
          this.id,
          async (content: unknown) =>
            this.streams.writer.next(wrapCapTp(content as CapTpMessage)),
          this.#bootstrap,
        );
        await this.replyToMessage(id, {
          type: Command.CapTpInit,
          data: null,
        });
        break;
      }
      case Command.Evaluate: {
        if (typeof message.data !== 'string') {
          console.error(
            `Supervisor "${this.id}" received message with unexpected data type`,
            // @ts-expect-error The type of `message.data` is `never`, but this could happen at runtime.
            stringifyResult(message.data),
          );
          return;
        }
        const result = this.evaluate(message.data);
        await this.replyToMessage(id, {
          type: Command.Evaluate,
          data: stringifyResult(result),
        });
        break;
      }
      default:
        console.error(`Unknown message type: ${message.type}`);
    }
  }

  /**
   * Reply to a message from the parent window.
   *
   * @param id - The id of the message to reply to.
   * @param message - The message to reply with.
   */
  async replyToMessage(id: string, message: VatMessage): Promise<void> {
    await this.streams.writer.next(wrapStreamCommand({ id, message }));
  }

  /**
   * Evaluate a string in the default compartment.
   *
   * @param source - The source string to evaluate.
   * @returns The result of the evaluation, or an error message.
   */
  evaluate(source: string): string {
    try {
      return this.#defaultCompartment.evaluate(source);
    } catch (error) {
      if (error instanceof Error) {
        return `Error: ${error.message}`;
      }
      return `Error: Unknown error during evaluation.`;
    }
  }
}
