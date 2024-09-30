import { isObject } from '@metamask/utils';
import type { TypeGuard } from '@ocap/utils';

import type { CapTpPayload } from './captp.js';
import { isCapTpPayload } from './captp.js';
import { makeMessageKit, messageType } from './message-kit.js';
import { vatTestCommand } from './vat-test.js';

export const kernelTestCommand = {
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

const kernelTestCommandKit = makeMessageKit(kernelTestCommand);

export const KernelTestCommandMethod = kernelTestCommandKit.methods;

export type KernelTestCommand = typeof kernelTestCommandKit.send;
export const isKernelTestCommand: TypeGuard<KernelTestCommand> =
  kernelTestCommandKit.sendGuard;
export type KernelTestCommandFunction<Return> = ReturnType<
  typeof kernelTestCommandKit.sendFunction<Return>
>;

export type KernelTestCommandReply = typeof kernelTestCommandKit.reply;
export const isKernelTestCommandReply: TypeGuard<KernelTestCommandReply> =
  kernelTestCommandKit.replyGuard;
export type KernelTestCommandReplyFunction<Return> = ReturnType<
  typeof kernelTestCommandKit.replyFunction<Return>
>;
