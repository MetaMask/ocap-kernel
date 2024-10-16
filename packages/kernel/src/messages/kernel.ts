import { isObject } from '@metamask/utils';
import type { TypeGuard } from '@ocap/utils';

import { kernelTestCommand } from './kernel-test.js';
import { makeMessageKit, messageType } from './message-kit.js';
import type { VatId } from '../types.js';
import { isVatId } from '../types.js';

export const kernelCommand = {
  InitKernel: messageType<null, { initTime: number; defaultVat: VatId }>(
    (send) => send === null,
    (reply) =>
      isObject(reply) &&
      typeof reply.initTime === 'number' &&
      isVatId(reply.defaultVat),
  ),

  ...kernelTestCommand,
};

const kernelCommandKit = makeMessageKit(kernelCommand);

export const KernelCommandMethod = kernelCommandKit.methods;

export type KernelCommand = typeof kernelCommandKit.send;
export const isKernelCommand: TypeGuard<KernelCommand> =
  kernelCommandKit.sendGuard;

export type KernelCommandReply = typeof kernelCommandKit.reply;
export const isKernelCommandReply: TypeGuard<KernelCommandReply> =
  kernelCommandKit.replyGuard;
