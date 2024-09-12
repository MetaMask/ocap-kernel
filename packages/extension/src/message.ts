import type { Primitive } from '@endo/captp';
import { isObject } from '@metamask/utils';

export type MessageId = string;

type DataObject =
  | Primitive
  | Promise<DataObject>
  | DataObject[]
  | { [key: string]: DataObject };

export enum ExtensionMessageTarget {
  Background = 'background',
  Offscreen = 'offscreen',
}

type CommandForm<
  CommandType extends Command,
  Data extends DataObject,
  TargetType extends ExtensionMessageTarget,
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

type CommandMessage<TargetType extends ExtensionMessageTarget> =
  | CommandForm<Command.Ping, null | 'pong', TargetType>
  | CommandForm<Command.Evaluate, string, TargetType>
  | CommandForm<Command.CapTpInit, null, TargetType>
  | CommandForm<Command.CapTpCall, CapTpPayload, TargetType>;

export type ExtensionMessage = CommandMessage<ExtensionMessageTarget>;
export type IframeMessage = CommandMessage<never>;

export type WrappedIframeMessage = {
  id: MessageId;
  message: IframeMessage;
};

export const isWrappedIframeMessage = (
  value: unknown,
): value is WrappedIframeMessage =>
  isObject(value) &&
  typeof value.id === 'string' &&
  isObject(value.message) &&
  typeof value.message.type === 'string' &&
  (typeof value.message.data === 'string' || value.message.data === null);
