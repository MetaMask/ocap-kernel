import {
  array,
  boolean,
  literal,
  number,
  object,
  optional,
  size,
  string,
  union,
} from '@metamask/superstruct';

export type {
  ChatChoice,
  ChatMessage,
  ChatParams,
  ChatResult,
  ChatRole,
  ChatStreamChunk,
  ChatStreamDelta,
  Usage,
} from '../types.ts';

const ChatRoleStruct = union([
  literal('system'),
  literal('user'),
  literal('assistant'),
]);

const ChatMessageStruct = object({
  role: ChatRoleStruct,
  content: string(),
});

const StopStruct = optional(union([string(), array(string())]));

/**
 * Superstruct schema for chat completion request parameters.
 */
export const ChatParamsStruct = object({
  model: size(string(), 1, Infinity),
  messages: array(ChatMessageStruct),
  max_tokens: optional(number()),
  temperature: optional(number()),
  top_p: optional(number()),
  stop: StopStruct,
  seed: optional(number()),
  n: optional(number()),
  stream: optional(boolean()),
});
