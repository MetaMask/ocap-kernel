import { isObject } from '@metamask/utils';
import type { VatId } from '@ocap/kernel';
import { makeMessageKit, messageType, isVatId } from '@ocap/kernel';
import type { TypeGuard } from '@ocap/utils';

export type KernelStatus = {
  isRunning: boolean;
  activeVats: VatId[];
};

const kernelControlCommand = {
  InitKernel: messageType<null, null>(
    (send) => send === null,
    (reply) => reply === null,
  ),
  ShutdownKernel: messageType<null, null>(
    (send) => send === null,
    (reply) => reply === null,
  ),
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
    (reply) =>
      isObject(reply) &&
      typeof reply.isRunning === 'boolean' &&
      Array.isArray(reply.activeVats) &&
      reply.activeVats.every((id) => isVatId(id)),
  ),
};

const kernelControlKit = makeMessageKit(kernelControlCommand);

export const isKernelControlCommand: TypeGuard<KernelControlCommand> =
  kernelControlKit.sendGuard;

export const isKernelControlReply: TypeGuard<KernelControlReply> =
  kernelControlKit.replyGuard;

export type KernelControlCommand = typeof kernelControlKit.send;
export type KernelControlReply = typeof kernelControlKit.reply;
