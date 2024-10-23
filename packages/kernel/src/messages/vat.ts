import { makeIdentifiedMessageKit, messageType } from './message-kit.js';
import { vatTestCommand } from './vat-test.js';
import { isVatId } from '../types.js';
import type { VatId } from '../types.js';

export const vatCommand = {
  CapTpInit: messageType<null, string>(
    (send) => send === null,
    (reply) => typeof reply === 'string',
  ),

  ...vatTestCommand,
};

const vatMessageKit = makeIdentifiedMessageKit({
  source: vatCommand,
  isMessageId: (value: unknown): value is `${VatId}:${number}` =>
    typeof value === 'string' &&
    /^\w+:\d+$/u.test(value) &&
    isVatId(value.split(':')[0]),
});

export const VatCommandMethod = vatMessageKit.methods;

export type VatCommand = typeof vatMessageKit.send;
export const isVatCommand = vatMessageKit.sendGuard;

export type VatCommandReply = typeof vatMessageKit.reply;
export const isVatCommandReply = vatMessageKit.replyGuard;
