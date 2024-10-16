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

const vatMessageKit = makeIdentifiedMessageKit(
  vatCommand,
  (value: unknown): value is `${VatId}:${number}` => {
    if (typeof value !== 'string') {
      return false;
    }
    const parts = value.split(':');
    return (
      parts.length === 2 &&
      isVatId(parts[0]) &&
      parts[1] === String(Number(parts[1]))
    );
  },
);

export const VatCommandMethod = vatMessageKit.methods;

export type VatCommand = typeof vatMessageKit.send;
export const isVatCommand = vatMessageKit.sendGuard;

export type VatCommandReply = typeof vatMessageKit.reply;
export const isVatCommandReply = vatMessageKit.replyGuard;
