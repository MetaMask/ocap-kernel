import type { Primitive } from '@endo/captp';

export enum CommandMethod {
  CapTpCall = 'callCapTp',
  CapTpInit = 'makeCapTp',
  Evaluate = 'evaluate',
  Ping = 'ping',
}

type CommandParams =
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
  | CommandLike<CommandMethod.CapTpCall, CapTpPayload>;

export type CommandReply =
  | CommandLike<CommandMethod.Ping, 'pong'>
  | CommandLike<CommandMethod.Evaluate, string>
  | CommandLike<CommandMethod.CapTpInit, '~~~ CapTP Initialized ~~~'>
  | CommandLike<CommandMethod.CapTpCall, string>;

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
