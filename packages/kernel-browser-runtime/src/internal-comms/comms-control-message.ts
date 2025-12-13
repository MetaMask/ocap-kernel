import type { TypeGuard } from '@metamask/kernel-utils';
import { object, literal, is, string } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

export const CommsControlMethod = {
  init: 'init',
} as const;

export type CommsControlMethod = keyof typeof CommsControlMethod;

const CommsControlMessageStruct = object({
  method: literal(CommsControlMethod.init),
  params: object({
    channelName: string(),
  }),
});

export type CommsControlMessage = Infer<typeof CommsControlMessageStruct>;

export const isCommsControlMessage: TypeGuard<CommsControlMessage> = (
  value: unknown,
): value is CommsControlMessage => is(value, CommsControlMessageStruct);
