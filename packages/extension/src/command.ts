import type { PromiseKit } from '@endo/promise-kit';
import { makePromiseKit } from '@endo/promise-kit';
import { isObject } from '@metamask/utils';
import type { StreamPair } from '@ocap/streams';

import type { ChannelMaker, EnvelopeChannel } from './channel.js';
import { isDataObject, type DataObject } from './data-object.js';
import { makeEnveloper, makeIsEnvelope } from './envelope.js';
import type { Envelope } from './envelope.js';
import type { MaybeIdentified } from './message.js';
import { isIdentified, makeNextMessageId } from './message.js';
import { Command, Label } from './shared.js';
import type { MessageId, VatId } from './shared.js';

export { Command };

const label = Label.Command;

export const isCommand = (value: unknown): value is Command =>
  typeof value === 'string' && value in Command;

type CommandMessageForm<
  Com extends Command,
  Data extends DataObject = DataObject,
> = { type: Com; data: Data };

export type CommandMessage = MaybeIdentified<
  | CommandMessageForm<Command.Ping, null | 'pong'>
  | CommandMessageForm<Command.Evaluate, string>
  | CommandMessageForm<Command.CapTpInit, null>
  | CommandMessageForm<Command.CapTpCall>
>;

export const isCommandMessage = (value: unknown): value is CommandMessage =>
  isObject(value) &&
  typeof value.type !== 'undefined' &&
  typeof value.data !== 'undefined' &&
  isCommand(value.type) &&
  isDataObject(value.data);

export type CommandEnvelope = Envelope<typeof label, CommandMessage>;

export const isCommandEnvelope = makeIsEnvelope<typeof label, CommandMessage>({
  label,
  isMessage: (value) => isIdentified<CommandMessage>(value, isCommandMessage),
});

/**
 * Checks that the provided CommandMessageType is a known CommandMessage,
 * and if so returns the CommandType (Command.Ping, etc.) of the CommandMessage.
 */
export type CommandOf<CommandMessageType> =
  CommandMessageType extends CommandMessage
    ? CommandMessageType extends CommandMessageForm<infer CommandType>
      ? CommandType
      : never
    : never;

export const makeCommandChannel: ChannelMaker<CommandEnvelope> = (
  vatId: VatId,
  streams: StreamPair<CommandEnvelope>,
): EnvelopeChannel<CommandEnvelope> => {
  const nextId = makeNextMessageId(`${vatId}-`);

  const unresolvedMessages: Map<
    MessageId,
    Omit<PromiseKit<unknown>, 'promise'>
  > = new Map();

  const enveloper = makeEnveloper<CommandEnvelope>({ label });

  return {
    isEnvelope: enveloper.check,
    sendMessage: async (message) => {
      console.log('sending message:', message);
      const identifiedMessage = isIdentified<CommandMessage>(message)
        ? message
        : { messageId: nextId(), ...message };
      const { messageId } = identifiedMessage;
      console.debug('messageId:', messageId);
      const { promise, reject, resolve } = makePromiseKit();

      unresolvedMessages.set(messageId, { reject, resolve });
      console.log(unresolvedMessages);
      await streams.writer.next(enveloper.wrap(identifiedMessage));
      return promise;
    },
    handleEnvelope: (envelope) => {
      console.log('got message!');
      if (!enveloper.check(envelope)) {
        throw new Error(
          'Command channel was passed an unexpected envelope.\n' +
            `envelope: ${JSON.stringify(envelope, null, 2)}`,
        );
      }
      const message = enveloper.unwrap(envelope);
      if (!isIdentified<CommandMessage>(message)) {
        throw new Error(
          'Command channel was passed an unidentified message.\n' +
            `message: ${JSON.stringify(message, null, 2)}`,
        );
      }
      const { messageId, data } = message;
      const promiseCallbacks = unresolvedMessages.get(messageId);
      if (promiseCallbacks === undefined) {
        console.error(`No unresolved message with id "${messageId}".`);
      } else {
        unresolvedMessages.delete(messageId);
        promiseCallbacks.resolve(data);
      }
    },
    open: async (): Promise<void> => {
      console.log('commandChannel.open');
    },
    close: async () => {
      for (const [messageId, message] of unresolvedMessages) {
        console.warn(
          'Unhandled orphaned message.\n' +
            `${JSON.stringify({ messageId, message }, null, 2)}`,
        );
      }
    },
  };
};
