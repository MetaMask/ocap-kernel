import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, literal, string } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

const closeConnectionParamsStruct = object({
  peerId: string(),
});

type CloseConnectionParams = Infer<typeof closeConnectionParamsStruct>;

export type CloseConnectionSpec = MethodSpec<
  'closeConnection',
  CloseConnectionParams,
  null
>;

export const closeConnectionSpec: CloseConnectionSpec = {
  method: 'closeConnection',
  params: closeConnectionParamsStruct,
  result: literal(null),
};

export type CloseConnection = (peerId: string) => Promise<null>;

type CloseConnectionHooks = {
  closeConnection: CloseConnection;
};

export type CloseConnectionHandler = Handler<
  'closeConnection',
  CloseConnectionParams,
  Promise<null>,
  CloseConnectionHooks
>;

export const closeConnectionHandler: CloseConnectionHandler = {
  ...closeConnectionSpec,
  hooks: { closeConnection: true },
  implementation: async ({ closeConnection }, params) => {
    return await closeConnection(params.peerId);
  },
};
