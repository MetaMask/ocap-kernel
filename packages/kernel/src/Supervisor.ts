import { makeCapTP } from '@endo/captp';
import type { StreamPair, Reader } from '@ocap/streams';
import { stringify } from '@ocap/utils';

import type { CapTpMessage, CommandReply, VatCommand } from './command.js';
import { CommandMethod } from './command.js';
import type {
  StreamEnvelope,
  StreamEnvelopeHandler,
  StreamEnvelopeReply,
} from './stream-envelope.js';
import {
  makeStreamEnvelopeHandler,
  wrapCapTp,
  wrapStreamCommandReply,
} from './stream-envelope.js';

type SupervisorConstructorProps = {
  id: string;
  streams: StreamPair<StreamEnvelope, StreamEnvelopeReply>;
  bootstrap?: unknown;
};

export class Supervisor {
  readonly id: string;

  readonly streams: StreamPair<StreamEnvelope, StreamEnvelopeReply>;

  readonly streamEnvelopeHandler: StreamEnvelopeHandler;

  readonly #defaultCompartment = new Compartment({ URL });

  readonly #bootstrap: unknown;

  capTp?: ReturnType<typeof makeCapTP>;

  constructor({ id, streams, bootstrap }: SupervisorConstructorProps) {
    this.id = id;
    this.#bootstrap = bootstrap;
    this.streams = streams;

    this.streamEnvelopeHandler = makeStreamEnvelopeHandler(
      {
        command: this.handleMessage.bind(this),
        capTp: async (content) => this.capTp?.dispatch(content),
      },
      (error) => console.error('Supervisor stream error:', error),
    );

    this.#receiveMessages(this.streams.reader).catch((error) => {
      console.error(
        `Unexpected read error from Supervisor "${this.id}"`,
        error,
      );
      throw error;
    });
  }

  /**
   * Receives messages from a vat.
   *
   * @param reader - The reader for the messages.
   */
  async #receiveMessages(reader: Reader<StreamEnvelope>): Promise<void> {
    for await (const rawMessage of reader) {
      console.debug('Supervisor received message', rawMessage);
      await this.streamEnvelopeHandler.handle(rawMessage);
    }
  }

  /**
   * Terminates the Supervisor.
   */
  async terminate(): Promise<void> {
    await this.streams.return();
  }

  /**
   * Handle a message from the parent window.
   *
   * @param vatMessage - The vat message to handle.
   * @param vatMessage.id - The id of the message.
   * @param vatMessage.payload - The payload to handle.
   */
  async handleMessage({ id, payload }: VatCommand): Promise<void> {
    switch (payload.method) {
      case CommandMethod.Evaluate: {
        if (typeof payload.params !== 'string') {
          console.error(
            'Supervisor received command with unexpected params',
            // @ts-expect-error Runtime does not respect "never".
            stringify(payload.params),
          );
          return;
        }
        const result = this.evaluate(payload.params);
        await this.replyToMessage(id, {
          method: CommandMethod.Evaluate,
          params: stringify(result),
        });
        break;
      }
      case CommandMethod.CapTpInit: {
        this.capTp = makeCapTP(
          'iframe',
          async (content: unknown) =>
            this.streams.writer.next(wrapCapTp(content as CapTpMessage)),
          this.#bootstrap,
        );
        await this.replyToMessage(id, {
          method: CommandMethod.CapTpInit,
          params: '~~~ CapTP Initialized ~~~',
        });
        break;
      }
      case CommandMethod.Ping:
        await this.replyToMessage(id, {
          method: CommandMethod.Ping,
          params: 'pong',
        });
        break;
      default:
        console.error(
          `Supervisor received unexpected command method: "${payload.method}"`,
        );
    }
  }

  /**
   * Reply to a message from the parent window.
   *
   * @param id - The id of the message to reply to.
   * @param payload - The payload to reply with.
   */
  async replyToMessage(id: string, payload: CommandReply): Promise<void> {
    await this.streams.writer.next(wrapStreamCommandReply({ id, payload }));
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
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      return `Error: ${(error as { message?: string }).message || 'Unknown'}`;
    }
  }
}
