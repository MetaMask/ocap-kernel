import { isObject } from '@metamask/utils';
import type { Json } from '@metamask/utils';
import type { KernelCommand, VatId } from '@ocap/kernel';
import { makeMessageKit, messageType, isVatId } from '@ocap/kernel';
import type { TypeGuard } from '@ocap/utils';

export type KernelStatus = {
  isRunning: boolean;
  activeVats: VatId[];
};

export const isKernelStatus: TypeGuard<KernelStatus> = (
  value,
): value is KernelStatus =>
  isObject(value) &&
  typeof value.isRunning === 'boolean' &&
  Array.isArray(value.activeVats) &&
  value.activeVats.every((id) => isVatId(id));

const kernelControlCommand = {
  LaunchVat: messageType<{ id: VatId }, null>(
    (send) => isObject(send) && isVatId(send.id),
    (reply) => reply === null,
  ),
  RestartVat: messageType<{ id: VatId }, null>(
    (send) => isObject(send) && isVatId(send.id),
    (reply) => reply === null,
  ),
  TerminateVat: messageType<{ id: VatId }, null>(
    (send) => isObject(send) && isVatId(send.id),
    (reply) => reply === null,
  ),
  TerminateAllVats: messageType<null, null>(
    (send) => send === null,
    (reply) => reply === null,
  ),
  GetStatus: messageType<null, KernelStatus>(
    (send) => send === null,
    isKernelStatus,
  ),
  SendMessage: messageType<{ id?: VatId; payload: KernelCommand }, Json>(
    (send) =>
      isObject(send) &&
      (send.id === undefined || isVatId(send.id)) &&
      isObject(send.payload),
    (reply) => isObject(reply),
  ),
};

const kernelControlKit = makeMessageKit(kernelControlCommand);

export const isKernelControlCommand: TypeGuard<KernelControlCommand> =
  kernelControlKit.sendGuard;

export const isKernelControlReply: TypeGuard<KernelControlReply> =
  kernelControlKit.replyGuard;

export type KernelControlCommand = typeof kernelControlKit.send;
export type KernelControlReply = typeof kernelControlKit.reply;
