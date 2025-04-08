import { object, literal, is, string } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type { TypeGuard } from '@ocap/utils';

export const UiControlMethod = {
  init: 'init',
} as const;

export type UiControlMethod = keyof typeof UiControlMethod;

const UiControlCommandStruct = object({
  method: literal(UiControlMethod.init),
  params: string(), // The UI instance's BroadcastChannel name
});

export type UiControlCommand = Infer<typeof UiControlCommandStruct>;

export const isUiControlCommand: TypeGuard<UiControlCommand> = (
  value: unknown,
): value is UiControlCommand => is(value, UiControlCommandStruct);
