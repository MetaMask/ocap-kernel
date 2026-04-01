import type {
  AssistantStreamDelta,
  ChatStreamChunk,
  ChatStreamToolCallDelta,
} from '../types.ts';

/**
 * `delta` object as emitted on the wire by OpenAI-style SSE (role often omitted
 * after the first chunk).
 */
export type ChatStreamDeltaWire = {
  role?: 'assistant';
  content?: string;
  tool_calls?: ChatStreamToolCallDelta[];
};

/**
 * One stream event before normalization to {@link ChatStreamChunk}.
 */
export type ChatStreamChunkWire = {
  id: string;
  model: string;
  choices: {
    delta: ChatStreamDeltaWire;
    index: number;
    finish_reason: string | null;
  }[];
};

/**
 * Coerce a wire delta into an assistant-only delta with required `role`.
 *
 * @param delta - Parsed `delta` from one SSE `choices[]` entry.
 * @returns Delta with `role: 'assistant'` and any wire fields carried over.
 */
export function normalizeAssistantStreamDelta(
  delta: ChatStreamDeltaWire,
): AssistantStreamDelta {
  if (delta.role === undefined || delta.role === 'assistant') {
    const out: AssistantStreamDelta = { role: 'assistant' };
    if ('content' in delta) {
      out.content = delta.content;
    }
    if ('tool_calls' in delta) {
      out.tool_calls = delta.tool_calls;
    }
    return out;
  }
  throw new TypeError(
    `Expected stream delta role to be "assistant" or omitted, received: ${String(delta.role)}`,
  );
}

/**
 * Normalize every choice delta in a parsed SSE JSON object.
 *
 * @param chunk - One parsed `data:` JSON object from the stream.
 * @returns The same chunk with each `delta` normalized to {@link AssistantStreamDelta}.
 */
export function normalizeStreamChunk(
  chunk: ChatStreamChunkWire,
): ChatStreamChunk {
  return {
    id: chunk.id,
    model: chunk.model,
    choices: chunk.choices.map((choice) => ({
      index: choice.index,
      finish_reason: choice.finish_reason,
      delta: normalizeAssistantStreamDelta(choice.delta),
    })),
  };
}
