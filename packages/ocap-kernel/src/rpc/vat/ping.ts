import { EmptyJsonArray } from '@metamask/kernel-utils';
import { string } from '@metamask/superstruct';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';

export type PingSpec = MethodSpec<'ping', EmptyJsonArray, string>;

export const pingSpec: PingSpec = {
  method: 'ping',
  params: EmptyJsonArray,
  result: string(),
} as const;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type PingHandler = Handler<'ping', EmptyJsonArray, string, {}>;

export const pingHandler: PingHandler = {
  ...pingSpec,
  hooks: {},
  implementation: () => 'pong',
};
