import { makeCapTP } from '@endo/captp';
import { importBundle } from '@endo/import-bundle';
import type { Json } from '@metamask/utils';
import { StreamReadError } from '@ocap/errors';
import type { DuplexStream } from '@ocap/streams';
import { stringify } from '@ocap/utils';

import type {
  VatCommand,
  VatCommandParams,
  VatCommandReply,
} from './messages/index.js';
import { VatCommandMethod, MessageResolver } from './messages/index.js';
import { Baggage } from './storage/baggage.js';
import { provideObject } from './storage/providers.js';
import { VatStore } from './storage/vat-store.js';
import type { SupervisorId, UserCodeStartFn, VatId } from './types.js';
import { isVatConfig } from './types.js';

export class Supervisor {
  // Set default supervisorId until Supervisor is initialized
  supervisorId: SupervisorId = 'vNull_supervisor';

  readonly #commandStream: DuplexStream<VatCommand, VatCommandReply>;

  readonly #capTpStream: DuplexStream<Json, Json>;

  readonly #defaultCompartment = new Compartment({ URL });

  readonly #bootstrap: unknown;

  capTp?: ReturnType<typeof makeCapTP>;

  #loaded: boolean = false;

  #store: VatStore | undefined;

  #baggage: Baggage | undefined;

  #resolver: MessageResolver | undefined;

  constructor({
    commandStream,
    capTpStream,
    bootstrap,
  }: {
    commandStream: DuplexStream<VatCommand, VatCommandReply>;
    capTpStream: DuplexStream<Json, Json>;
    bootstrap: unknown;
  }) {
    this.#commandStream = commandStream;
    this.#capTpStream = capTpStream;
    this.#bootstrap = bootstrap;

    Promise.all([
      this.#commandStream.drain(this.handleMessage.bind(this)),
      this.#capTpStream.drain((content): void => {
        this.capTp?.dispatch(content);
      }),
    ]).catch(async (error) => {
      console.error(
        `Unexpected read error from Supervisor "${this.supervisorId}"`,
        error,
      );
      await this.terminate(
        new StreamReadError({ supervisorId: this.supervisorId }, error),
      );
    });
  }

  /**
   * Initializes the Supervisor.
   *
   * @param vatId - The id of the vat.
   */
  #init(vatId: VatId): void {
    this.supervisorId = `${vatId}_supervisor`;
    this.#resolver = new MessageResolver(this.supervisorId);
    this.#store = new VatStore(vatId, this.#commandStream, this.#resolver);
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

    if (error) {
      this.#resolver?.terminateAll(error);
    }

    const terminationError = error ?? new Error('Supervisor terminated');
    this.#resolver?.terminateAll(terminationError);
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
      case VatCommandMethod.storage: {
        this.#resolver?.handleResponse(id, payload.params);
        break;
      }
      case VatCommandMethod.capTpInit: {
        await this.#capTpInit();
        await this.replyToMessage(id, {
          method: VatCommandMethod.capTpInit,
          params: '~~~ CapTP Initialized ~~~',
        });
        break;
      }
      case VatCommandMethod.initSupervisor: {
        this.#init(payload.params.vatId);
        const rootObject = await this.#loadUserCode(payload.params);
        await this.replyToMessage(id, {
          method: VatCommandMethod.initSupervisor,
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

  /**
   * Load user code.
   *
   * @param params - The parameters to load user code with.
   * @returns The loaded user code.
   */
  async #loadUserCode(
    params: VatCommandParams<typeof VatCommandMethod.initSupervisor>,
  ): Promise<unknown> {
    if (this.#loaded) {
      throw Error(
        'Supervisor received LoadUserCode after user code already loaded',
      );
    }
    this.#loaded = true;
    const vatConfig = params.config;
    if (!isVatConfig(vatConfig)) {
      throw Error('Supervisor received LoadUserCode with bad config parameter');
    }
    // XXX TODO: this check can and should go away once we can handle `bundleName` and `sourceSpec` too
    if (!vatConfig.bundleSpec) {
      throw Error(
        'for now, only bundleSpec is support in vatConfig specifications',
      );
    }

    const { bundleSpec, parameters } = vatConfig;
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const fetched = await fetch(bundleSpec);
    if (!fetched.ok) {
      throw Error(`fetch of user code ${bundleSpec} failed: ${fetched.status}`);
    }
    const bundle = await fetched.json();
    const vatNS = await importBundle(bundle, {
      endowments: {
        console,
        baggage: this.#baggage,
        provideObject,
        Date,
      },
    });

    // Start User Code
    const { start }: { start: UserCodeStartFn } = vatNS;
    if (start === undefined) {
      throw Error(`vat module ${bundleSpec} has no start function`);
    }
    const vatObject = start(parameters);
    if (typeof vatObject.name !== 'string') {
      throw Error('Vat object must have a .name property');
    }

    return vatObject;
  }

  /**
   * Initialize the CapTP connection.
   */
  async #capTpInit(): Promise<void> {
    this.capTp = makeCapTP(
      'iframe',
      async (content: Json) => this.#capTpStream.write(content),
      this.#bootstrap,
    );
  }
}
