/**
 * Wire-shape types and walker helpers for the ocap JSON-RPC vat's
 * line-delimited JSON-RPC 2.0 protocol.
 *
 * Object references are named via the sigil convention `"@@NAME"` (NAME
 * one or more alphanumeric characters). The mediator assigns names of the
 * form `o<n>`; other allocation schemes remain compatible with the walker.
 */

/** Full sigil string prefix (two `@`). */
export const MARKER_PREFIX = '@@';

/**
 * Match a whole string that consists solely of the sigil plus an
 * alphanumeric name. Anchored deliberately: an embedded `@@x` is
 * plain data.
 */
export const MARKER_PATTERN = /^@@([A-Za-z0-9]+)$/u;

export type JsonRpcId = number | string | null;

export type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcSuccessResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcErrorResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
};

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

/**
 * Standard JSON-RPC 2.0 error codes plus a mediator-specific application
 * code in the reserved `-32000..-32099` range.
 */
export const JSON_RPC_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  APPLICATION_ERROR: -32000,
} as const;

/**
 * Thrown from inside the mediator's request handlers to signal the
 * intended JSON-RPC error code and message.
 */
export class BridgeRpcError extends Error {
  readonly code: number;

  readonly data?: unknown;

  /**
   * @param code - JSON-RPC error code to report (see {@link JSON_RPC_ERROR}).
   * @param message - Human-readable error description.
   * @param data - Optional additional error data to attach.
   */
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

/**
 * Walk `value`, replacing every `"@@NAME"` marker string with
 * `resolve(name)`. Descends into plain arrays and record-like objects.
 *
 * @param value - The value to walk.
 * @param resolve - Callback that turns a NAME into a live reference.
 * If it returns `undefined` the walker throws — an unknown marker is
 * always an error, since silently passing the string through would let
 * callers accidentally send the literal `"@@..."` to a service.
 * @returns A tree in which markers have been replaced by their live
 * references and everything else is unchanged.
 */
export function expandMarkers(
  value: unknown,
  resolve: (name: string) => unknown,
): unknown {
  if (typeof value === 'string') {
    const match = MARKER_PATTERN.exec(value);
    if (!match) {
      return value;
    }
    const name = match[1] as string;
    const resolved = resolve(name);
    if (resolved === undefined) {
      throw new BridgeRpcError(
        JSON_RPC_ERROR.INVALID_PARAMS,
        `unknown reference marker "@@${name}"`,
      );
    }
    return resolved;
  }
  if (Array.isArray(value)) {
    return value.map((item) => expandMarkers(item, resolve));
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = expandMarkers(val, resolve);
    }
    return out;
  }
  return value;
}

/**
 * Walk `value`, replacing every remotable (as identified by
 * `isRemotable`) with `"${MARKER_PREFIX}${assign(remotable)}"`.
 * Descends into arrays and record-like objects. Primitives pass
 * through unchanged.
 *
 * The result is a JSON-safe tree ready for `JSON.stringify`.
 *
 * @param value - The value to walk.
 * @param isRemotable - Predicate identifying a value that should be
 * substituted for a marker.
 * @param assign - Callback that turns a remotable into a marker NAME
 * (assigning one on first sight, reusing on subsequent sight).
 * @returns A JSON-safe tree with remotables replaced by marker strings.
 */
export function substituteRemotables(
  value: unknown,
  isRemotable: (candidate: unknown) => boolean,
  assign: (remotable: unknown) => string,
): unknown {
  if (isRemotable(value)) {
    return `${MARKER_PREFIX}${assign(value)}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteRemotables(item, isRemotable, assign));
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = substituteRemotables(val, isRemotable, assign);
    }
    return out;
  }
  return value;
}
