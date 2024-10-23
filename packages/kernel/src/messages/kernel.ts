import { isObject } from '@metamask/utils';
import type { TypeGuard } from '@ocap/utils';

import type { CapTpPayload } from './captp.js';
import { isCapTpPayload } from './captp.js';
import { makeMessageKit, messageType } from './message-kit.js';
import { vatTestCommand } from './vat-test.js';

export const kernelCommand = {
  CapTpCall: messageType<CapTpPayload, string>(
    (send) => isCapTpPayload(send),
    (reply) => typeof reply === 'string',
  ),

  KVSet: messageType<{ key: string; value: string }, string>(
    (send) =>
      isObject(send) &&
      typeof send.key === 'string' &&
      typeof send.value === 'string',
    (reply) => typeof reply === 'string',
  ),

  KVGet: messageType<string, string>(
    (send) => typeof send === 'string',
    (reply) => typeof reply === 'string',
  ),

  ...vatTestCommand,
};

const kernelCommandKit = makeMessageKit(kernelCommand);

export const KernelCommandMethod = kernelCommandKit.methods;

export type KernelCommand = typeof kernelCommandKit.send;
export const isKernelCommand: TypeGuard<KernelCommand> =
  kernelCommandKit.sendGuard;

export type KernelCommandReply = typeof kernelCommandKit.reply;
export const isKernelCommandReply: TypeGuard<KernelCommandReply> =
  kernelCommandKit.replyGuard;
