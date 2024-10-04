import { is } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import { hasProperty, isObject, UnsafeJsonStruct } from '@metamask/utils';

export enum CommandMethod {
  CapTpCall = 'callCapTp',
  CapTpInit = 'makeCapTp',
  Evaluate = 'evaluate',
  Ping = 'ping',
  KVSet = 'kvSet',
  KVGet = 'kvGet',
}

// The "Unsafe" here is because this guard can actually be cheated at runtime,
// but so long as we're only using it within our type boundaries, it should be fine.
const isJsonUnsafe = (value: unknown): value is Json =>
  is(value, UnsafeJsonStruct);

export type CapTpPayload = {
  method: string;
  params: Json[];
};

export const isCapTpPayload = (value: unknown): value is CapTpPayload =>
  isObject(value) &&
  typeof value.method === 'string' &&
  Array.isArray(value.params);

type CommandLike<Method extends CommandMethod, Data extends Json> = {
  method: Method;
  params: Data;
};

type CommandReplyLike<Method extends CommandMethod, Data extends Json> = {
  method: Method;
  params: Data;
};

const isCommandLike = (
  value: unknown,
): value is {
  method: CommandMethod;
  params: string | null | CapTpPayload;
} =>
  isObject(value) &&
  Object.values(CommandMethod).includes(value.method as CommandMethod) &&
  hasProperty(value, 'params') &&
  isJsonUnsafe(value.params);

export type Command =
  | CommandLike<CommandMethod.Ping, null>
  | CommandLike<CommandMethod.Evaluate, string>
  | CommandLike<CommandMethod.CapTpInit, null>
  | CommandLike<CommandMethod.CapTpCall, CapTpPayload>
  | CommandLike<CommandMethod.KVGet, string>
  | CommandLike<CommandMethod.KVSet, { key: string; value: string }>;

export const isCommand = (value: unknown): value is Command =>
  isCommandLike(value) &&
  (typeof value.params === 'string' ||
    value.params === null ||
    isObject(value.params) || // XXX certainly wrong, needs better TypeScript magic
    isCapTpPayload(value.params));

export type CommandFunction<Return = void | Promise<void>> = {
  (method: CommandMethod.Ping | CommandMethod.CapTpInit, params?: null): Return;
  (
    method: CommandMethod.Evaluate | CommandMethod.KVGet,
    params: string,
  ): Return;
  (method: CommandMethod.CapTpCall, params: CapTpPayload): Return;
  (method: CommandMethod.KVSet, params: { key: string; value: string }): Return;
};

export type CommandReply =
  | CommandReplyLike<CommandMethod.Ping, 'pong'>
  | CommandReplyLike<CommandMethod.Evaluate, string>
  | CommandReplyLike<CommandMethod.CapTpInit, string>
  | CommandReplyLike<CommandMethod.CapTpCall, string>
  | CommandReplyLike<CommandMethod.KVGet, string>
  | CommandReplyLike<CommandMethod.KVSet, string>;

export const isCommandReply = (value: unknown): value is CommandReply =>
  isCommandLike(value) && typeof value.params === 'string';

export type CommandReplyFunction<Return = void> = {
  (method: CommandMethod.Ping, params: 'pong'): Return;
  (method: Exclude<CommandMethod, CommandMethod.Ping>, params: string): Return;
};

export type VatCommand = {
  id: string;
  payload: Command;
};

export const isVatCommand = (value: unknown): value is VatCommand =>
  isObject(value) && typeof value.id === 'string' && isCommand(value.payload);

export type VatCommandReply = {
  id: string;
  payload: CommandReply;
};

export const isVatCommandReply = (value: unknown): value is VatCommandReply =>
  isObject(value) &&
  typeof value.id === 'string' &&
  isCommandReply(value.payload);

export type CapTpMessage<Type extends `CTP_${string}` = `CTP_${string}`> = {
  type: Type;
  epoch: number;
  [key: string]: Json;
};

export const isCapTpMessage = (value: unknown): value is CapTpMessage =>
  isObject(value) &&
  typeof value.type === 'string' &&
  value.type.startsWith('CTP_') &&
  typeof value.epoch === 'number';
