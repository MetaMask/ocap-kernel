import type { Handler, MethodSpec } from '@metamask/kernel-rpc-methods';
import { object, string } from '@metamask/superstruct';

/**
 * Create a new session channel and return its OCAP URL.
 */
export const createSessionChannelSpec: MethodSpec<
  'createSessionChannel',
  Record<string, never>,
  string
> = {
  method: 'createSessionChannel',
  params: object({}),
  result: string(),
};

export type CreateSessionChannelHooks = {
  channelFactory: { createChannel(): Promise<string> };
};

export const createSessionChannelHandler: Handler<
  'createSessionChannel',
  Record<string, never>,
  Promise<string>,
  CreateSessionChannelHooks
> = {
  ...createSessionChannelSpec,
  hooks: { channelFactory: true },
  implementation: async ({ channelFactory }): Promise<string> =>
    channelFactory.createChannel(),
};
