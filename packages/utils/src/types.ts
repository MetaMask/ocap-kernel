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
  | CommandLike<CommandMethod.Ping, null | 'pong'>
  | CommandLike<CommandMethod.Evaluate, string>
  | CommandLike<CommandMethod.CapTpInit, null>
  | CommandLike<CommandMethod.CapTpCall, CapTpPayload>
  | CommandLike<CommandMethod.KVGet, string>
  | CommandLike<CommandMethod.KVSet, { key: string, value: string }>
  ;

export type VatMessage = {
  id: string;
  payload: Command;
};

export type CapTpMessage<Type extends `CTP_${string}` = `CTP_${string}`> = {
  type: Type;
  epoch: number;
  [key: string]: unknown;
};
