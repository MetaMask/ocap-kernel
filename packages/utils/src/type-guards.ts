import { hasProperty, isObject } from '@metamask/utils';

import {
  type Command,
  type CapTpMessage,
  type VatMessage,
  type CapTpPayload,
  type CommandReply,
  CommandMethod,
} from './types.js';

export const isCapTpPayload = (value: unknown): value is CapTpPayload =>
  isObject(value) &&
  typeof value.method === 'string' &&
  Array.isArray(value.params);

const isCommandLike = (
  value: unknown,
): value is {
  method: CommandMethod;
  params: string | null | CapTpPayload;
} =>
  isObject(value) &&
  Object.values(CommandMethod).includes(value.method as CommandMethod) &&
  hasProperty(value, 'params');

export const isCommand = (value: unknown): value is Command =>
  isCommandLike(value) &&
  (typeof value.params === 'string' ||
    value.params === null ||
    isObject(value.params) || // XXX certainly wrong, needs better TypeScript magic
    isCapTpPayload(value.params));

export const isCommandReply = (value: unknown): value is CommandReply =>
  isCommandLike(value) && typeof value.params === 'string';

export const isVatMessage = (value: unknown): value is VatMessage =>
  isObject(value) && typeof value.id === 'string' && isCommand(value.payload);

export const isCapTpMessage = (value: unknown): value is CapTpMessage =>
  isObject(value) &&
  typeof value.type === 'string' &&
  value.type.startsWith('CTP_') &&
  typeof value.epoch === 'number';
