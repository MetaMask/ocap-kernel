import type { MethodSpec } from '@metamask/kernel-rpc-methods';
import { object, string } from '@metamask/superstruct';

type RemoteDeliverParams = {
  from: string;
  message: string;
};

export const remoteDeliverSpec: MethodSpec<
  'remoteDeliver',
  RemoteDeliverParams,
  string
> = {
  method: 'remoteDeliver',
  params: object({ from: string(), message: string() }),
  result: string(),
};
