import { makeMessageKit, messageType } from './message-kit.js';
import type { VatMessage } from './vat-message.js';
import { isVatMessage } from './vat-message.js';
import { vatTestCommand } from './vat-test.js';

export const vatCommand = {
  CapTpInit: messageType<null, string>(
    (send) => send === null,
    (reply) => typeof reply === 'string',
  ),

  ...vatTestCommand,
};

const vatMessageKit = makeMessageKit(vatCommand);

export const VatCommandMethod = vatMessageKit.methods;

export type VatCommand = VatMessage<typeof vatMessageKit.send>;
export const isVatCommand = (value: unknown): value is VatCommand =>
  isVatMessage(value) && vatMessageKit.sendGuard(value.payload);

export type VatCommandReply = VatMessage<typeof vatMessageKit.reply>;
export const isVatCommandReply = (value: unknown): value is VatCommandReply =>
  isVatMessage(value) && vatMessageKit.replyGuard(value.payload);
