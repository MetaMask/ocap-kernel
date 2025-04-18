import { is, literal, object, string, union } from '@metamask/superstruct';
import type { Infer, Struct } from '@metamask/superstruct';
import { EmptyJsonArray } from '@ocap/utils';
import type { TypeGuard } from '@ocap/utils';

export const KernelCommandMethod = {
  ping: 'ping',
} as const;

// Explicitly annotated due to a TS2742 error that occurs during CommonJS
// builds by ts-bridge.
const KernelCommandStruct = union([
  object({
    method: literal('ping'),
    params: EmptyJsonArray,
  }),
]) as Struct<
  {
    method: 'ping';
    params: EmptyJsonArray;
  },
  null
>;

const KernelCommandReplyStruct = object({
  method: literal('ping'),
  params: string(),
});

export type KernelCommand = Infer<typeof KernelCommandStruct>;
export type KernelCommandReply = Infer<typeof KernelCommandReplyStruct>;

export const isKernelCommand: TypeGuard<KernelCommand> = (
  value: unknown,
): value is KernelCommand => is(value, KernelCommandStruct);

export const isKernelCommandReply: TypeGuard<KernelCommandReply> = (
  value: unknown,
): value is KernelCommandReply => is(value, KernelCommandReplyStruct);
