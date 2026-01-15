import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, literal, string } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

// Message is already serialized as a string by RemoteHandle
const sendRemoteMessageParamsStruct = object({
  to: string(),
  message: string(),
});

type SendRemoteMessageParams = Infer<typeof sendRemoteMessageParamsStruct>;

export type SendRemoteMessageSpec = MethodSpec<
  'sendRemoteMessage',
  SendRemoteMessageParams,
  null
>;

export const sendRemoteMessageSpec: SendRemoteMessageSpec = {
  method: 'sendRemoteMessage',
  params: sendRemoteMessageParamsStruct,
  result: literal(null),
};

export type SendRemoteMessage = (to: string, message: string) => Promise<null>;

type SendRemoteMessageHooks = {
  sendRemoteMessage: SendRemoteMessage;
};

export type SendRemoteMessageHandler = Handler<
  'sendRemoteMessage',
  SendRemoteMessageParams,
  Promise<null>,
  SendRemoteMessageHooks
>;

export const sendRemoteMessageHandler: SendRemoteMessageHandler = {
  ...sendRemoteMessageSpec,
  hooks: { sendRemoteMessage: true },
  implementation: async ({ sendRemoteMessage }, params) => {
    return await sendRemoteMessage(params.to, params.message);
  },
};
