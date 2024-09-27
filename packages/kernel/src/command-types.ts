import type { Primitive } from '@endo/captp';

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

type CommandLike<Method extends CommandMethod, Data extends CommandParams> = {
  method: Method;
  params: Data;
};

export type Command =
  | CommandLike<CommandMethod.Ping, null>
  | CommandLike<CommandMethod.Evaluate, string>
  | CommandLike<CommandMethod.CapTpInit, null>
  | CommandLike<CommandMethod.CapTpCall, CapTpPayload>
  | CommandLike<CommandMethod.KVGet, string>
  | CommandLike<CommandMethod.KVSet, { key: string; value: string }>;

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

export type VatCommandReply = {
  id: string;
  payload: CommandReply;
};

export type CapTpMessage<Type extends `CTP_${string}` = `CTP_${string}`> = {
  type: Type;
  epoch: number;
  [key: string]: unknown;
};
