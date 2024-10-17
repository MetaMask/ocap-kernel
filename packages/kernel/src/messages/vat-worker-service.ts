import { hasProperty, isObject } from '@metamask/utils';
import { ErrorCode, isMarshaledError } from '@ocap/errors';
import type { MarshaledError } from '@ocap/errors';
import type { TypeGuard } from '@ocap/utils';

import { makeIdentifiedMessageKit, messageType } from './message-kit.js';
import type { VatId } from '../types.js';
import { isVatId } from '../types.js';

const hasOptionalMarshaledError = (value: object, code: ErrorCode): boolean =>
  !hasProperty(value, 'error') ||
  (isMarshaledError(value.error) && value.error.code === code);

export const vatWorkerServiceCommand = {
  Launch: messageType<
    { vatId: VatId },
    // Expect VatAlreadyExistsError.
    { vatId: VatId; error?: MarshaledError }
  >(
    (send) => isObject(send) && isVatId(send.vatId),
    (reply) =>
      isObject(reply) &&
      isVatId(reply.vatId) &&
      hasOptionalMarshaledError(reply, ErrorCode.VatAlreadyExists),
  ),

  Terminate: messageType<
    { vatId: VatId },
    // Expect VatDeletedError.
    { vatId: VatId; error?: MarshaledError }
  >(
    (send) => isObject(send) && isVatId(send.vatId),
    (reply) =>
      isObject(reply) &&
      isVatId(reply.vatId) &&
      hasOptionalMarshaledError(reply, ErrorCode.VatDeleted),
  ),

  TerminateAll: messageType<
    null,
    null | { vatId?: VatId; error: MarshaledError }
  >(
    (send) => send === null,
    (reply) =>
      reply === null ||
      (isObject(reply) &&
        isMarshaledError(reply.error) &&
        (!hasProperty(reply, 'vatId') || isVatId(reply.vatId))),
  ),
};

const messageKit = makeIdentifiedMessageKit(
  vatWorkerServiceCommand,
  (value: unknown): value is `m${number}` =>
    typeof value === 'string' &&
    value.at(0) === 'm' &&
    value.slice(1) === String(Number(value.slice(1))),
);

export const VatWorkerServiceCommandMethod = messageKit.methods;

export type VatWorkerServiceCommand = typeof messageKit.send;
export const isVatWorkerServiceCommand: TypeGuard<VatWorkerServiceCommand> =
  messageKit.sendGuard;

export type VatWorkerServiceCommandReply = typeof messageKit.reply;
export const isVatWorkerServiceCommandReply: TypeGuard<VatWorkerServiceCommandReply> =
  messageKit.replyGuard;
