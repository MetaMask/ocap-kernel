/**
 * Transcribed with care from @chipmorningstar's "Notes on the Design of an Ocap Kernel"
 *
 * Sure would be nice to automatically generate these typeguards.
 */
import { isObject } from '@metamask/utils';

import type { DataObject } from './data-object.js';
import { isDataObject } from './data-object.js';
import { isObjectReference } from './reference.js';

export type ObjectMessagePayload = {
  target: string;
  method: string;
  args: DataObject;
};

export const isObjectMessagePayload = (
  value: unknown,
): value is ObjectMessagePayload =>
  isObject(value) &&
  typeof value.target !== 'undefined' &&
  isObjectReference(value.target) &&
  typeof value.method === 'string' &&
  typeof value.args !== 'undefined' &&
  isDataObject(value.args);

export type ObjectMessage<Result = unknown> = ObjectMessagePayload & {
  result?: Result;
};

export const isObjectMessage = <Result = unknown>(
  value: unknown,
  isResult?: (val: unknown) => val is Result,
): value is ObjectMessage<Result> =>
  isObjectMessagePayload(value) &&
  (typeof Object(value).result === 'undefined' ||
    isResult === undefined ||
    isResult(value));

export type MessageId = string;
export type Identified<Content> = Content & { messageId: MessageId };
export type MaybeIdentified<Content> = Content | Identified<Content>;

export const isIdentified = <Content>(
  value: unknown,
  isContent?: (val: unknown) => val is Content,
): value is Identified<Content> =>
  isObject(value) &&
  typeof value.messageId === 'string' &&
  (isContent === undefined || isContent(value));

export const makeNextMessageId = (prefix: string = '') => {
  let currentId = 0;
  return (): MessageId => {
    currentId += 1;
    return prefix + String(currentId);
  };
};
