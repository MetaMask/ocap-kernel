import { makeCapTP } from '@endo/captp';
import type { DuplexStream } from '@ocap/streams';
import { stringify } from '@ocap/utils';

import type {
  CapTpMessage,
  VatCommand,
  VatCommandReply,
  VatMessageId,
} from './messages.js';
import { VatCommandMethod } from './messages.js';
import type { StreamEnvelope, StreamEnvelopeReply } from './stream-envelope.js';
import {
  makeStreamEnvelopeHandler,
  wrapCapTp,
  wrapStreamCommandReply,
} from './stream-envelope.js';

type SupervisorConstructorProps = {
  id: string;
  stream: DuplexStream<StreamEnvelope, StreamEnvelopeReply>;
  bootstrap?: unknown;
};

export class Supervisor {
  readonly id: string;

  readonly stream: DuplexStream<StreamEnvelope, StreamEnvelopeReply>;

  readonly #defaultCompartment = new Compartment({ URL });

  readonly #bootstrap: unknown;

  capTp?: ReturnType<typeof makeCapTP>;

  constructor({ id, stream, bootstrap }: SupervisorConstructorProps) {
    this.id = id;
    this.#bootstrap = bootstrap;
    this.stream = stream;

    const streamEnvelopeHandler = makeStreamEnvelopeHandler(
      {
        command: this.handleMessage.bind(this),
        capTp: async (content) => this.capTp?.dispatch(content),
      },
      (error) => console.error('Supervisor stream error:', error),
    );

    this.stream
      .drain(async (value) => {
        await streamEnvelopeHandler.handle(value);
      })
      .catch((error) => {
        console.error(
          `Unexpected read error from Supervisor "${this.id}"`,
          error,
        );
        throw error;
      });
  }

  /**
   * Terminates the Supervisor.
   */
  async terminate(): Promise<void> {
    await this.stream.return();
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
      case VatCommandMethod.Evaluate: {
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
          method: VatCommandMethod.Evaluate,
          params: stringify(result),
        });
        break;
      }
      case VatCommandMethod.CapTpInit: {
        this.capTp = makeCapTP(
          'iframe',
          async (content: unknown) =>
            this.stream.write(wrapCapTp(content as CapTpMessage)),
          this.#bootstrap,
        );
        await this.replyToMessage(id, {
          method: VatCommandMethod.CapTpInit,
          params: '~~~ CapTP Initialized ~~~',
        });
        break;
      }
      case VatCommandMethod.Ping:
        await this.replyToMessage(id, {
          method: VatCommandMethod.Ping,
          params: 'pong',
        });
        break;
      default:
        console.error(
          'Supervisor received unexpected command method:',
          // @ts-expect-error Runtime does not respect "never".
          payload.method,
        );
    }
  }

  /**
   * Reply to a message from the parent window.
   *
   * @param id - The id of the message to reply to.
   * @param payload - The payload to reply with.
   */
  async replyToMessage(
    id: VatMessageId,
    payload: VatCommandReply['payload'],
  ): Promise<void> {
    await this.stream.write(wrapStreamCommandReply({ id, payload }));
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
