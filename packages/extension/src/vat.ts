import type { Reader, StreamPair } from '@ocap/streams';

import type { CapTPDataEnvelope, CapTPEnvelope } from './captp.js';
import { makeCapTPChannel } from './captp.js';
import type { EnvelopeChannel } from './channel.js';
import type { CommandEnvelope, CommandMessage } from './command.js';
import { makeCommandChannel, Command } from './command.js';
import type { DataObject } from './data-object.js';
import { isLabelledMessage } from './envelope.js';
import { Label, type VatId } from './shared.js';
import type { VatRealm } from './vat-realm.js';

export type VatEnvelope = CommandEnvelope | CapTPEnvelope | CapTPDataEnvelope;

class Vat {
  id: VatId;

  readonly #realm: VatRealm;

  #streams: StreamPair<VatEnvelope> | undefined;

  #commandChannel: EnvelopeChannel<CommandEnvelope> | undefined;

  #capTpChannel: EnvelopeChannel<CapTPEnvelope> | undefined;

  constructor(id: VatId, realm: VatRealm) {
    this.id = id;
    this.#realm = realm;
  }

  async launch(): Promise<unknown> {
    const [newWindow, streams]: [Window, StreamPair<VatEnvelope>] =
      (await this.#realm.setup()) as [Window, StreamPair<VatEnvelope>];
    this.#streams = streams;

    // initialize command channel
    const commandChannel = makeCommandChannel(
      this.id,
      streams as StreamPair<CommandEnvelope>,
    );
    await commandChannel.open();

    this.#commandChannel = commandChannel;

    // wake up vat supervisor
    const wakeUp = commandChannel.sendMessage({
      messageId: this.id,
      type: Command.Ping,
      data: null,
    });

    // start receiving messages
    this.#receiveMessages(streams.reader).catch((error) => {
      console.error(`Unexpected read error from vat "${this.id}"`, error);
      this.terminate().catch(() => undefined);
    });

    console.debug(`Created vat with id "${this.id}"`);
    await wakeUp;

    // enable sendCommand
    console.debug(`Vat supervisor with id "${this.id}" is awake.`);
    this.#commandChannel = commandChannel;
    return newWindow;
  }

  async terminate(reason?: undefined): Promise<void> {
    await this.#capTpChannel?.close(reason);
    await this.#commandChannel?.close(reason);
    await this.#streams?.return();
    await this.#realm.teardown();
  }

  async sendCommand(message: CommandMessage): Promise<unknown> {
    if (this.#commandChannel === undefined) {
      throw new Error('Command channel not yet open.');
    }
    return this.#commandChannel.sendMessage(message);
  }

  async makeCapTp(): Promise<void> {
    if (this.#capTpChannel !== undefined) {
      throw new Error(
        `Vat with id "${this.id}" already has a CapTP connection.`,
      );
    }
    // initialize capTp channel
    const capTp = makeCapTPChannel(
      this.id,
      this.#streams as StreamPair<CapTPEnvelope>,
      this.#commandChannel,
    );
    await capTp.open();
    console.debug(`Initialized capTp for vat with id "${this.id}"`);

    this.#capTpChannel = capTp;
  }

  async callCapTp(method: string, ...params: DataObject[]): Promise<unknown> {
    if (this.#capTpChannel === undefined) {
      throw new Error('CapTP channel not yet open.');
    }
    return this.#capTpChannel.sendMessage({ method, params });
  }

  async #receiveMessages(reader: Reader<VatEnvelope>): Promise<void> {
    await new Promise(() => console.log('receiving messages...'));
    for await (const rawMessage of reader) {
      console.debug('Offscreen received message', rawMessage);

      if (!isLabelledMessage(rawMessage)) {
        console.warn(
          'Offscreen received message with unexpected format',
          rawMessage,
        );
        return;
      }

      switch (rawMessage.label) {
        case Label.CAPTP: {
          this.#capTpChannel?.handleEnvelope(rawMessage as CapTPEnvelope);
          break;
        }
        case Label.COMMAND: {
          this.#commandChannel?.handleEnvelope(rawMessage as CommandEnvelope);
          break;
        }
        /* v8 ignore next 2: Exhaustiveness check */
        default:
          throw new Error(`Unexpected message label "${rawMessage.label}".`);
      }
    }
  }
}
harden(Vat);
export { Vat };
