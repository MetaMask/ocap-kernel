import {
  any,
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
  Tool,
  ToolCall,
  Usage,
} from '../types.ts';

const ChatRoleStruct = union([
  literal('system'),
  literal('user'),
  literal('assistant'),
  literal('tool'),
]);

const ToolCallStruct = object({
  id: string(),
  type: literal('function'),
  index: optional(number()),
  function: object({ name: string(), arguments: string() }),
});

const ChatMessageStruct = object({
  role: ChatRoleStruct,
  content: string(),
  tool_calls: optional(array(ToolCallStruct)),
  tool_call_id: optional(string()),
});

const ToolStruct = object({
  type: literal('function'),
  function: object({
    name: string(),
    description: optional(string()),
    parameters: optional(any()),
  }),
});

const StopStruct = optional(union([string(), array(string())]));

/**
 * Superstruct schema for chat completion request parameters.
 */
export const ChatParamsStruct = object({
  model: size(string(), 1, Infinity),
  messages: array(ChatMessageStruct),
  tools: optional(array(ToolStruct)),
  max_tokens: optional(number()),
  temperature: optional(number()),
  top_p: optional(number()),
  stop: StopStruct,
  seed: optional(number()),
  n: optional(number()),
  stream: optional(boolean()),
});
