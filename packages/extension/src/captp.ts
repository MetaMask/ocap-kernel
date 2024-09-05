import { E, makeCapTP } from '@endo/captp';
import type { StreamPair } from '@ocap/streams';

import type { ChannelMaker, EnvelopeChannel } from './channel.js';
import type { CommandEnvelope } from './command.js';
import { Command } from './command.js';
import type { DataObject } from './data-object.js';
import { makeEnveloper, type Envelope } from './envelope.js';
import { Label, type VatId } from './shared.js';

const label = Label.CapTP;

export type CapTPMessage = { method: string; params: DataObject[] };
export type CapTPDataEnvelope = Envelope<typeof label>;
export type CapTPEnvelope = Envelope<typeof label, CapTPMessage>;

export const makeCapTPChannel: ChannelMaker<CapTPEnvelope> = (
  vatId: VatId,
  streams: StreamPair<CapTPEnvelope | CapTPDataEnvelope>,
  commandChannel: EnvelopeChannel<CommandEnvelope>,
): EnvelopeChannel<CapTPEnvelope> => {
  let capTp: ReturnType<typeof makeCapTP> | undefined;

  const enveloper = makeEnveloper<CapTPEnvelope>({
    label,
    wrap: (message) => {
      console.debug(
        `CapTP to vat "${vatId}"`,
        JSON.stringify(message, null, 2),
      );
      return { label, message };
    },
  });

  return {
    isEnvelope: enveloper.check,

    handleEnvelope: (envelope) => {
      const message = enveloper.unwrap(envelope);
      console.debug(
        `CapTP from vat "${vatId}"`,
        JSON.stringify(message, null, 2),
      );
      if (capTp !== undefined) {
        capTp.dispatch(message);
      }
    },

    sendMessage: async (message: CapTPMessage): Promise<unknown> => {
      if (capTp === undefined) {
        throw new Error(
          `Vat with id "${vatId}" does not have a CapTP connection.`,
        );
      }
      return E(capTp.getBootstrap())[message.method](...message.params);
    },

    open: async () => {
      if (capTp !== undefined) {
        throw new Error(`Vat "${vatId}" already has a CapTP connection.`);
      }

      // https://github.com/endojs/endo/issues/2412
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      capTp = makeCapTP(vatId, async (message: DataObject) => {
        await streams.writer.next({ label, message });
      });

      await commandChannel.sendMessage({ type: Command.CapTpInit, data: null });
    },

    close: async (reason?: undefined) => {
      if (capTp === undefined) {
        console.warn(
          `Vat "${vatId}$" attempted to close CapTPChannel that wasn't open.`,
        );
        return;
      }

      capTp.abort(reason);
    },
  };
};
