import {
  array,
  boolean,
  literal,
  nullable,
  number,
  object,
  optional,
  size,
  string,
  union,
  unknown,
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

const SystemMessageStruct = object({
  role: literal('system'),
  content: string(),
});

const UserMessageStruct = object({
  role: literal('user'),
  content: string(),
});

const AssistantMessageStruct = object({
  role: literal('assistant'),
  content: nullable(string()),
  tool_calls: optional(array(ToolCallStruct)),
});

const ToolMessageStruct = object({
  role: literal('tool'),
  content: string(),
  tool_call_id: string(),
});

const ChatMessageStruct = union([
  SystemMessageStruct,
  UserMessageStruct,
  AssistantMessageStruct,
  ToolMessageStruct,
]);

const ToolStruct = object({
  type: literal('function'),
  function: object({
    name: string(),
    description: optional(string()),
    parameters: optional(unknown()),
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

const UsageStruct = object({
  prompt_tokens: number(),
  completion_tokens: number(),
  total_tokens: number(),
});

const ChatChoiceStruct = object({
  message: ChatMessageStruct,
  index: number(),
  finish_reason: nullable(string()),
});

/**
 * Superstruct schema for a non-streaming `/v1/chat/completions` response body.
 */
export const ChatResultStruct = object({
  id: string(),
  model: string(),
  choices: array(ChatChoiceStruct),
  usage: UsageStruct,
});

const ChatStreamDeltaStruct = object({
  role: optional(ChatRoleStruct),
  content: optional(string()),
  tool_calls: optional(array(unknown())),
});

/**
 * Superstruct schema for one SSE `data:` JSON object from `/v1/chat/completions` when `stream: true`.
 */
export const ChatStreamChunkStruct = object({
  id: string(),
  model: string(),
  choices: array(
    object({
      delta: ChatStreamDeltaStruct,
      index: number(),
      finish_reason: nullable(string()),
    }),
  ),
});

/**
 * Superstruct schema for a `/v1/models` response body (only fields we read).
 */
export const ListModelsResponseStruct = object({
  data: array(object({ id: string() })),
});
