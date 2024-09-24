import type { Primitive } from '@endo/captp';

export enum CommandType {
  CapTpCall = 'callCapTp',
  CapTpInit = 'makeCapTp',
  Evaluate = 'evaluate',
  Ping = 'ping',
}

type DataObject =
  | Primitive
  | Promise<DataObject>
  | DataObject[]
  | { [key: string]: DataObject };

export type CapTpPayload = {
  method: string;
  params: DataObject[];
};

type CommandLike<Type extends CommandType, Data extends DataObject> = {
  type: Type;
  data: Data;
};

export type Command =
  | CommandLike<CommandType.Ping, null | 'pong'>
  | CommandLike<CommandType.Evaluate, string>
  | CommandLike<CommandType.CapTpInit, null>
  | CommandLike<CommandType.CapTpCall, CapTpPayload>;

export type VatMessage = {
  id: string;
  payload: Command;
};

export type CapTpMessage<Type extends `CTP_${string}` = `CTP_${string}`> = {
  type: Type;
  epoch: number;
  [key: string]: unknown;
};
