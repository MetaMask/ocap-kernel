import type { Primitive } from '@endo/captp';

export enum CommandMethod {
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

type CommandLike<Type extends CommandMethod, Data extends DataObject> = {
  type: Type;
  data: Data;
};

export type Command =
  | CommandLike<CommandMethod.Ping, null | 'pong'>
  | CommandLike<CommandMethod.Evaluate, string>
  | CommandLike<CommandMethod.CapTpInit, null>
  | CommandLike<CommandMethod.CapTpCall, CapTpPayload>;

export type VatMessage = {
  id: string;
  payload: Command;
};

export type CapTpMessage<Type extends `CTP_${string}` = `CTP_${string}`> = {
  type: Type;
  epoch: number;
  [key: string]: unknown;
};
