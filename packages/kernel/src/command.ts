import type { Primitive } from '@endo/captp';
import { hasProperty, isObject } from '@metamask/utils';

export enum CommandMethod {
  CapTpCall = 'callCapTp',
  CapTpInit = 'makeCapTp',
  Evaluate = 'evaluate',
  Ping = 'ping',
  KVSet = 'kvSet',
  KVGet = 'kvGet',
}

export type CommandParams =
  | Primitive
  | Promise<CommandParams>
  | CommandParams[]
  | { [key: string]: CommandParams };

export type CapTpPayload = {
  method: string;
  params: CommandParams[];
};

export const isCapTpPayload = (value: unknown): value is CapTpPayload =>
  isObject(value) &&
  typeof value.method === 'string' &&
  Array.isArray(value.params);

type CommandLike<Method extends CommandMethod, Data extends CommandParams> = {
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
  hasProperty(value, 'params');

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
  | CommandLike<CommandMethod.Ping, 'pong'>
  | CommandLike<CommandMethod.Evaluate, string>
  | CommandLike<CommandMethod.CapTpInit, string>
  | CommandLike<CommandMethod.CapTpCall, string>
  | CommandLike<CommandMethod.KVGet, string>
  | CommandLike<CommandMethod.KVSet, string>;

export const isCommandReply = (value: unknown): value is CommandReply =>
  isCommandLike(value) && typeof value.params === 'string';

type UnionMinus<Union, Minus> = Union extends Minus ? never : Union;

export type CommandReplyFunction<Return = void> = {
  (method: CommandMethod.Ping, params: 'pong'): Return;
  (
    method: UnionMinus<CommandMethod, CommandMethod.Ping>,
    params: string,
  ): Return;
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
  [key: string]: unknown;
};

export const isCapTpMessage = (value: unknown): value is CapTpMessage =>
  isObject(value) &&
  typeof value.type === 'string' &&
  value.type.startsWith('CTP_') &&
  typeof value.epoch === 'number';
