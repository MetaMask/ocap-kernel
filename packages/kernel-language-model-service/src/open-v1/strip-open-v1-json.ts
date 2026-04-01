/**
 * Reduce permissive Open /v1 JSON bodies to the shapes validated by our
 * Superstruct schemas, dropping provider-specific keys (e.g. `object`).
 */

/**
 * @param value - Unknown JSON value.
 * @returns Plain object record, or `null` if not a non-null object.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * @param call - Raw tool call from JSON.
 * @returns Plain object matching the non-streaming tool-call struct.
 */
function stripToolCall(call: unknown): unknown {
  const row = asRecord(call);
  if (!row) {
    return call;
  }
  const fnRow = asRecord(row.function);
  return {
    id: row.id,
    type: 'function',
    ...(typeof row.index === 'number' ? { index: row.index } : {}),
    function: {
      name: typeof fnRow?.name === 'string' ? fnRow.name : '',
      arguments: typeof fnRow?.arguments === 'string' ? fnRow.arguments : '',
    },
  };
}

/**
 * @param raw - Raw `message` object from JSON.
 * @returns Plain object matching a `ChatMessage` union variant.
 */
function stripMessage(raw: unknown): unknown {
  const row = asRecord(raw);
  if (!row || typeof row.role !== 'string') {
    return raw;
  }
  switch (row.role) {
    case 'system':
      return { role: 'system', content: row.content };
    case 'user':
      return { role: 'user', content: row.content };
    case 'assistant': {
      const out: Record<string, unknown> = {
        role: 'assistant',
        content: row.content === undefined ? null : row.content,
      };
      if (Array.isArray(row.tool_calls)) {
        out.tool_calls = row.tool_calls.map(stripToolCall);
      }
      return out;
    }
    case 'tool':
      return {
        role: 'tool',
        content: row.content,
        tool_call_id: row.tool_call_id,
      };
    default:
      return raw;
  }
}

/**
 * @param raw - Raw choice from JSON.
 * @returns Plain object matching one chat choice in a result.
 */
function stripChoice(raw: unknown): unknown {
  const row = asRecord(raw);
  if (!row) {
    return raw;
  }
  return {
    message: stripMessage(row.message),
    index: row.index,
    finish_reason: row.finish_reason === undefined ? null : row.finish_reason,
  };
}

/**
 * @param raw - Raw `usage` object from JSON.
 * @returns Plain object matching token `usage`.
 */
function stripUsage(raw: unknown): unknown {
  const row = asRecord(raw);
  if (!row) {
    return raw;
  }
  return {
    prompt_tokens: row.prompt_tokens,
    completion_tokens: row.completion_tokens,
    total_tokens: row.total_tokens,
  };
}

/**
 * Keep only fields used for non-streaming chat result validation.
 *
 * @param json - Parsed `/v1/chat/completions` response body.
 * @returns Plain object with only `id`, `model`, `choices`, `usage`.
 */
export function stripChatResultJson(json: unknown): unknown {
  const row = asRecord(json);
  if (!row) {
    return json;
  }
  return {
    id: row.id,
    model: row.model,
    choices: Array.isArray(row.choices) ? row.choices.map(stripChoice) : [],
    usage: stripUsage(row.usage),
  };
}

/**
 * @param item - One element of `data` from `/v1/models`.
 * @returns `{ id }` only.
 */
function stripModelEntry(item: unknown): unknown {
  const row = asRecord(item);
  if (!row) {
    return item;
  }
  return { id: row.id };
}

/**
 * Keep only fields used for `/v1/models` response validation.
 *
 * @param json - Parsed `/v1/models` response body.
 * @returns Plain object with only `data: { id }[]`.
 */
export function stripListModelsResponseJson(json: unknown): unknown {
  const row = asRecord(json);
  if (!row || !Array.isArray(row.data)) {
    return json;
  }
  return {
    data: row.data.map(stripModelEntry),
  };
}

/**
 * @param raw - One streaming tool-call fragment.
 * @returns Plain object matching one streaming tool-call delta fragment.
 */
function stripStreamToolCallDelta(raw: unknown): unknown {
  const part = asRecord(raw);
  if (!part) {
    return raw;
  }
  const fnRow = asRecord(part.function);
  const fnOut: Record<string, unknown> = {};
  if (fnRow) {
    if ('name' in fnRow) {
      fnOut.name = fnRow.name;
    }
    if ('arguments' in fnRow) {
      fnOut.arguments = fnRow.arguments;
    }
  }
  return {
    ...(typeof part.index === 'number' ? { index: part.index } : {}),
    ...(typeof part.id === 'string' ? { id: part.id } : {}),
    ...(part.type === 'function' ? { type: 'function' } : {}),
    ...(Object.keys(fnOut).length > 0 ? { function: fnOut } : {}),
  };
}

/**
 * @param raw - Raw `delta` from a stream chunk.
 * @returns Plain object matching a streaming `delta` (wire shape).
 */
function stripStreamDelta(raw: unknown): unknown {
  const deltaRow = asRecord(raw);
  if (!deltaRow) {
    return raw;
  }
  const out: Record<string, unknown> = {};
  if ('role' in deltaRow) {
    out.role = deltaRow.role;
  }
  if ('content' in deltaRow) {
    out.content = deltaRow.content;
  }
  if (Array.isArray(deltaRow.tool_calls)) {
    out.tool_calls = deltaRow.tool_calls.map(stripStreamToolCallDelta);
  }
  return out;
}

/**
 * @param raw - Raw choice in a stream chunk.
 * @returns Stripped choice for one streaming chunk.
 */
function stripStreamChoice(raw: unknown): unknown {
  const row = asRecord(raw);
  if (!row) {
    return raw;
  }
  return {
    delta: stripStreamDelta(row.delta),
    index: row.index,
    finish_reason: row.finish_reason === undefined ? null : row.finish_reason,
  };
}

/**
 * Keep only fields used for streaming chunk validation (wire shape).
 *
 * @param json - Parsed one SSE `data:` JSON object.
 * @returns Plain object with `id`, `model`, `choices` only.
 */
export function stripChatStreamChunkJson(json: unknown): unknown {
  const row = asRecord(json);
  if (!row || !Array.isArray(row.choices)) {
    return json;
  }
  return {
    id: row.id,
    model: row.model,
    choices: row.choices.map(stripStreamChoice),
  };
}
