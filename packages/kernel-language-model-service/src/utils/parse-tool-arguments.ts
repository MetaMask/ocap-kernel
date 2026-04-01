export type ParseJsonObjectLabels = {
  /** Prefix for invalid JSON (message continues with preview and parse error). */
  invalidJson: string;
  /** Message when JSON parses but the top-level value is not a plain object. */
  notObject: string;
};

/**
 * Parse JSON text and ensure the top-level value is a plain object.
 *
 * @param json - Raw JSON text.
 * @param labels - Human-readable labels for thrown {@link SyntaxError} messages.
 * @returns The parsed object.
 * @throws {SyntaxError} When JSON is invalid or the value is not a plain object.
 */
export function parseJsonObject(
  json: string,
  labels: ParseJsonObjectLabels,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (cause) {
    const preview = json.length > 200 ? `${json.slice(0, 200)}…` : json;
    throw new SyntaxError(
      `${labels.invalidJson} (${preview}): ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SyntaxError(labels.notObject);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Parse a tool call `function.arguments` string (JSON) into a plain object.
 * Used for OpenAI-style chat `tool_calls` and when adapting messages for Ollama.
 *
 * @param json - Raw JSON object text from the model.
 * @returns Parsed object for APIs that expect a record.
 * @throws {SyntaxError} When JSON is invalid or the value is not a plain object.
 */
export function parseToolArguments(json: string): Record<string, unknown> {
  return parseJsonObject(json, {
    invalidJson: 'Invalid tool arguments JSON',
    notObject: 'Tool arguments must be a JSON object',
  });
}
