import { is } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import { isObject, UnsafeJsonStruct } from '@metamask/utils';

import { uncapitalize } from './utils.js';

const isJsonUnsafe = (value: unknown): value is Json =>
  is(value, UnsafeJsonStruct);

export type MessageLike = { method: Uncapitalize<string>; params: Json };

const isMethodLike = (value: unknown): value is Uncapitalize<string> =>
  typeof value === 'string' && uncapitalize(value) === value;

export const isMessageLike = (value: unknown): value is MessageLike =>
  isObject(value) && isMethodLike(value.method) && isJsonUnsafe(value.params);
