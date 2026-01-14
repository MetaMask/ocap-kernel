import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, literal, string, any } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import type { RemoteMessageBase } from '../../remotes/RemoteHandle.ts';

// Use any() for messageBase since RemoteMessageBase is a complex discriminated union
// that is JSON-serializable but hard to express in superstruct
const sendRemoteMessageParamsStruct = object({
  to: string(),
  messageBase: any(),
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

export type SendRemoteMessage = (
  to: string,
  messageBase: RemoteMessageBase,
) => Promise<null>;

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
    return await sendRemoteMessage(
      params.to,
      params.messageBase as RemoteMessageBase,
    );
  },
};
