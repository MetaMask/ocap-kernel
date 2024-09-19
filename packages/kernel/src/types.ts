import type { Primitive } from '@endo/captp';
import type { PromiseKit } from '@endo/promise-kit';

export type VatId = string;

export type MessageId = string;

export enum KernelMessageTarget {
  Background = 'background',
  Offscreen = 'offscreen',
  WebWorker = 'webWorker',
  Node = 'node',
}

export type PromiseCallbacks = Omit<PromiseKit<unknown>, 'promise'>;

export type UnresolvedMessages = Map<MessageId, PromiseCallbacks>;

export type GetPort = (targetWindow: Window) => Promise<MessagePort>;

export type DataObject =
  | Primitive
  | Promise<DataObject>
  | DataObject[]
  | { [key: string]: DataObject };

type CommandLike<
  CommandType extends Command,
  Data extends DataObject,
  TargetType extends KernelMessageTarget,
> = {
  type: CommandType;
  target?: TargetType;
  data: Data;
};

export enum Command {
  CapTpCall = 'callCapTp',
  CapTpInit = 'makeCapTp',
  Evaluate = 'evaluate',
  Ping = 'ping',
}

export type CapTpPayload = {
  method: string;
  params: DataObject[];
};

type CommandMessage<TargetType extends KernelMessageTarget> =
  | CommandLike<Command.Ping, null | 'pong', TargetType>
  | CommandLike<Command.Evaluate, string, TargetType>
  | CommandLike<Command.CapTpInit, null, TargetType>
  | CommandLike<Command.CapTpCall, CapTpPayload, TargetType>;

export type KernelMessage = CommandMessage<KernelMessageTarget>;
export type VatMessage = CommandMessage<never>;

export type WrappedVatMessage = {
  id: MessageId;
  message: VatMessage;
};

export type CapTpMessage<Type extends `CTP_${string}` = `CTP_${string}`> = {
  type: Type;
  epoch: number;
  [key: string]: unknown;
};
