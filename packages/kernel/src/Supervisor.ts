import { makeCapTP } from '@endo/captp';
import { importBundle } from '@endo/import-bundle';
import type { Json } from '@metamask/utils';
import { StreamReadError } from '@ocap/errors';
import type { DuplexStream } from '@ocap/streams';
import { stringify } from '@ocap/utils';

import type { VatCommand, VatCommandReply } from './messages/index.js';
import { VatCommandMethod } from './messages/index.js';
import { Baggage } from './storage/baggage';
import { provideObject, provideCollection } from './storage/providers';
import { VatStore } from './storage/vatstore';
import type { UserCodeStartFn, VatConfig } from './types.js';
import { isVatConfig } from './types.js';

type SupervisorConstructorProps = {
  id: string;
  commandStream: DuplexStream<VatCommand, VatCommandReply>;
  capTpStream: DuplexStream<Json, Json>;
  bootstrap?: unknown;
};

export class Supervisor {
  readonly id: string;

  readonly #commandStream: DuplexStream<VatCommand, VatCommandReply>;

  readonly #capTpStream: DuplexStream<Json, Json>;

  readonly #defaultCompartment = new Compartment({ URL });

  readonly #bootstrap: unknown;

  capTp?: ReturnType<typeof makeCapTP>;

  #loaded: boolean = false;

  readonly #store: VatStore;

  readonly #baggage: Baggage;

  constructor({
    id,
    commandStream,
    capTpStream,
    bootstrap,
  }: SupervisorConstructorProps) {
    this.id = id;
    this.#bootstrap = bootstrap;
    this.#commandStream = commandStream;
    this.#capTpStream = capTpStream;

    Promise.all([
      this.#commandStream.drain(this.handleMessage.bind(this)),
      this.#capTpStream.drain((content): void => {
        this.capTp?.dispatch(content);
      }),
    ]).catch(async (error) => {
      console.error(
        `Unexpected read error from Supervisor "${this.id}"`,
        error,
      );
      await this.terminate(
        new StreamReadError({ supervisorId: this.id }, error),
      );
    });

    this.#store = new VatStore(`v${id}`, kvStore);
    this.#baggage = new Baggage(this.#store);
  }

  /**
   * Terminates the Supervisor.
   *
   * @param error - The error to terminate the Supervisor with.
   */
  async terminate(error?: Error): Promise<void> {
    // eslint-disable-next-line promise/no-promise-in-callback
    await Promise.all([
      this.#commandStream.end(error),
      this.#capTpStream.end(error),
    ]);
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

      case VatCommandMethod.loadUserCode: {
        if (this.#loaded) {
          throw Error(
            'Supervisor received LoadUserCode after user code already loaded',
          );
        }
        this.#loaded = true;
        const vatConfig: VatConfig = payload.params as VatConfig;
        if (!isVatConfig(vatConfig)) {
          throw Error(
            'Supervisor received LoadUserCode with bad config parameter',
          );
        }
        // XXX TODO: this check can and should go away once we can handle `bundleName` and `sourceSpec` too
        if (!vatConfig.bundleSpec) {
          throw Error(
            'for now, only bundleSpec is support in vatConfig specifications',
          );
        }
        console.log('Supervisor requested user code load:', vatConfig);
        const { bundleSpec, parameters } = vatConfig;
        // This is not code running under Node, you idiots
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        const fetched = await fetch(bundleSpec);
        if (!fetched.ok) {
          throw Error(
            `fetch of user code ${bundleSpec} failed: ${fetched.status}`,
          );
        }
        const bundle = await fetched.json();
        const vatNS = await importBundle(bundle, {
          endowments: {
            console,
            baggage: this.#baggage,
            provideObject,
            provideCollection,
          },
        });
        const { start }: { start: UserCodeStartFn } = vatNS;
        if (start === undefined) {
          throw Error(`vat module ${bundleSpec} has no start function`);
        }
        const rootObject = start(parameters);
        await this.replyToMessage(id, {
          method: VatCommandMethod.loadUserCode,
          params: stringify(rootObject),
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
        throw Error(
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
