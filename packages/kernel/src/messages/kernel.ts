import type { TypeGuard } from '@ocap/utils';

import { kernelTestCommand } from './kernel-test.js';
import { makeMessageKit } from './message-kit.js';

export const kernelCommand = {
  ...kernelTestCommand,
};

const kernelCommandKit = makeMessageKit(kernelCommand);

export const KernelCommandMethod = kernelCommandKit.methods;

export type KernelCommand = typeof kernelCommandKit.send;
export const isKernelCommand: TypeGuard<KernelCommand> =
  kernelCommandKit.sendGuard;
export type KernelCommandFunction<Return> = ReturnType<
  typeof kernelCommandKit.sendFunction<Return>
>;

export type KernelCommandReply = typeof kernelCommandKit.reply;
export const isKernelCommandReply: TypeGuard<KernelCommandReply> =
  kernelCommandKit.replyGuard;
export type KernelCommandReplyFunction<Return> = ReturnType<
  typeof kernelCommandKit.replyFunction<Return>
>;
