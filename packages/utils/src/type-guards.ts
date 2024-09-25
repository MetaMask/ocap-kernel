import { hasProperty, isObject } from '@metamask/utils';

import {
  type Command,
  type CapTpMessage,
  type CapTpPayload,
  type CommandReply,
  CommandMethod,
  type VatCommand,
  type VatCommandReply,
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
    isCapTpPayload(value.params));

export const isCommandReply = (value: unknown): value is CommandReply =>
  isCommandLike(value) && typeof value.params === 'string';

export const isVatCommand = (value: unknown): value is VatCommand =>
  isObject(value) && typeof value.id === 'string' && isCommand(value.payload);

export const isVatCommandReply = (value: unknown): value is VatCommandReply =>
  isObject(value) && typeof value.id === 'string' && isCommand(value.payload);

export const isCapTpMessage = (value: unknown): value is CapTpMessage =>
  isObject(value) &&
  typeof value.type === 'string' &&
  value.type.startsWith('CTP_') &&
  typeof value.epoch === 'number';
