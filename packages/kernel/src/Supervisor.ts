import { makeCapTP } from '@endo/captp';
import type { Json } from '@metamask/utils';
import { StreamReadError } from '@ocap/errors';
import type { HandledDuplexStream, StreamMultiplexer } from '@ocap/streams';
import { stringify } from '@ocap/utils';

import type { VatCommand, VatCommandReply } from './messages/index.js';
import { isVatCommand, VatCommandMethod } from './messages/index.js';

type SupervisorConstructorProps = {
  id: string;
  multiplexer: StreamMultiplexer;
  bootstrap?: unknown;
};

export class Supervisor {
  readonly id: string;

  readonly #multiplexer: StreamMultiplexer;

  readonly #commandStream: HandledDuplexStream<VatCommand, VatCommandReply>;

  readonly #capTpStream: HandledDuplexStream<Json, Json>;

  readonly #defaultCompartment = new Compartment({ URL });

  readonly #bootstrap: unknown;

  capTp?: ReturnType<typeof makeCapTP>;

  constructor({ id, multiplexer, bootstrap }: SupervisorConstructorProps) {
    this.id = id;
    this.#bootstrap = bootstrap;
    this.#multiplexer = multiplexer;
    this.#commandStream = multiplexer.addChannel(
      'command',
      isVatCommand,
      this.handleMessage.bind(this),
    );
    this.#capTpStream = multiplexer.addChannel(
      'capTp',
      // The streams already enforce that the values are JSON.
      (_value): _value is Json => true,
      // eslint-disable-next-line no-void
      async (content): Promise<void> => void this.capTp?.dispatch(content),
    );

    multiplexer.drainAll().catch((error) => {
      console.error(
        `Unexpected read error from Supervisor "${this.id}"`,
        error,
      );
      throw new StreamReadError({ supervisorId: this.id }, error);
    });
  }

  /**
   * Terminates the Supervisor.
   */
  async terminate(): Promise<void> {
    await this.#multiplexer.return();
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
      case VatCommandMethod.evaluate: {
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
          method: VatCommandMethod.evaluate,
          params: stringify(result),
        });
        break;
      }
      case VatCommandMethod.capTpInit: {
        this.capTp = makeCapTP(
          'iframe',
          async (content: Json) => this.#capTpStream.write(content),
          this.#bootstrap,
        );
        await this.replyToMessage(id, {
          method: VatCommandMethod.capTpInit,
          params: '~~~ CapTP Initialized ~~~',
        });
        break;
      }
      case VatCommandMethod.ping:
        await this.replyToMessage(id, {
          method: VatCommandMethod.ping,
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
    id: VatCommandReply['id'],
    payload: VatCommandReply['payload'],
  ): Promise<void> {
    await this.#commandStream.write({ id, payload });
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
