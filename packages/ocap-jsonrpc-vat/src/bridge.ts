/**
 * Bridge core: the state machine and per-request dispatch used by the
 * ocap JSON-RPC vat.
 *
 * Factored out of the vat body so its behavior can be exercised in a plain
 * Node test environment. The vat wraps this factory with an IOService-driven
 * read/dispatch/write loop; production hooks bind `redeem` and `invoke` to
 * `E(...)` calls, tests pass in plain-function stand-ins.
 */

import type { JsonRpcId, JsonRpcRequest, JsonRpcResponse } from './json-rpc.ts';
import {
  JSON_RPC_ERROR,
  MARKER_PREFIX,
  BridgeRpcError,
  expandMarkers,
  substituteRemotables,
} from './json-rpc.ts';

export type BridgeHooks = {
  /** Redeem an OCAP URL to a live reference. */
  redeem: (url: string) => Promise<unknown>;
  /**
   * Send `method` with `args` to `target` and await the resolved result.
   * In production this is `E(target)[method](...args)`.
   */
  invoke: (
    target: unknown,
    method: string,
    args: unknown[],
  ) => Promise<unknown>;
  /**
   * Predicate identifying values the response walker should replace with
   * `"@@j<n>"` sigil strings. Production wires this to `passStyleOf`.
   */
  isRemotable: (value: unknown) => boolean;
  /**
   * Optional label identifying which connection this bridge serves, used
   * in error messages.
   *
   * Names are scoped to a connection, so "unknown reference" almost
   * always means the name was minted on a *different* connection than
   * the one asking. Without the label that has to be reconstructed by
   * correlating kernel refs in the daemon log, which is a lot of work to
   * learn something the error could simply have said.
   */
  label?: string | undefined;
};

export type Bridge = {
  /**
   * Handle one already-parsed JSON-RPC request and return the response.
   * Never throws; all errors are packaged as JSON-RPC error responses.
   */
  dispatch: (request: unknown) => Promise<JsonRpcResponse>;
  /**
   * Discard the naming table. Invoked by the vat when the socket client
   * disconnects so the next connection begins with fresh names.
   */
  resetSession: () => void;
};

/**
 * Construct a bridge with an empty naming table.
 *
 * @param hooks - Callbacks that bridge into the environment (URL
 * redemption, message send, remotable identification).
 * @returns The bridge control interface.
 */
export function makeBridge(hooks: BridgeHooks): Bridge {
  let nameToObj = new Map<string, unknown>();
  let objToName = new Map<unknown, string>();
  let nextObjId = 0;

  /**
   * Describe this bridge for error messages.
   *
   * @returns The connection label, or a generic phrase when unlabelled.
   */
  const where = (): string => hooks.label ?? 'this connection';

  /**
   * Names minted while handling the current request and not yet disclosed to
   * the client. A name only becomes usable once the client has actually been
   * sent a reply carrying it; see `dispatch`.
   */
  let stagedNames: string[] = [];

  /** `nextObjId` as of the start of the current request, for rollback. */
  let objIdBeforeRequest = 0;

  const resetSession = (): void => {
    nameToObj = new Map();
    objToName = new Map();
    nextObjId = 0;
    stagedNames = [];
    objIdBeforeRequest = 0;
  };

  const assignName = (obj: unknown): string => {
    const existing = objToName.get(obj);
    if (existing !== undefined) {
      // Already disclosed by an earlier reply, so it is not this request's to
      // stage — and must survive if this request is rolled back.
      return existing;
    }
    nextObjId += 1;
    const name = `j${nextObjId}`;
    nameToObj.set(name, obj);
    objToName.set(obj, name);
    stagedNames.push(name);
    return name;
  };

  /**
   * Discard the names minted for the current request, so a reply the client
   * never received leaves no reachable reference behind.
   *
   * `nextObjId` is rewound too. Reusing an id is safe precisely because a
   * rolled-back name was never disclosed: no client can be holding it.
   */
  const rollbackNames = (): void => {
    for (const name of stagedNames) {
      if (nameToObj.has(name)) {
        objToName.delete(nameToObj.get(name));
        nameToObj.delete(name);
      }
    }
    nextObjId = objIdBeforeRequest;
    stagedNames = [];
  };

  const resolveName = (name: string): unknown => nameToObj.get(name);

  const handleRedeemURL = async (params: unknown): Promise<unknown> => {
    const url = requireUrlString(params);
    const obj = await hooks.redeem(url);
    return `${MARKER_PREFIX}${assignName(obj)}`;
  };

  const handleSend = async (params: unknown): Promise<unknown> => {
    const { target, method, args } = requireSendParams(params);
    const targetObj = resolveName(target);
    if (targetObj === undefined) {
      // Report which connection failed to resolve the name and what it
      // does hold. Names are per-connection, so the usual cause is a name
      // minted on a different connection than the one now using it.
      const known = [...nameToObj.keys()]
        .map((name) => `${MARKER_PREFIX}${name}`)
        .join(', ');
      throw new BridgeRpcError(
        JSON_RPC_ERROR.INVALID_PARAMS,
        `params.target "@@${target}" is not a known reference on ` +
          `${where()} (known here: ${known || 'none'})`,
      );
    }
    const expandedArgs = expandMarkers(args, resolveName) as unknown[];
    const result = await hooks.invoke(targetObj, method, expandedArgs);
    return substituteRemotables(result, hooks.isRemotable, assignName);
  };

  const handleRequest = async (request: unknown): Promise<JsonRpcResponse> => {
    const id = extractId(request);
    if (!isJsonRpcRequest(request)) {
      return errorResponse(
        id,
        JSON_RPC_ERROR.INVALID_REQUEST,
        'not a well-formed JSON-RPC 2.0 request',
      );
    }
    try {
      switch (request.method) {
        case 'redeemURL':
          return successResponse(
            request.id,
            await handleRedeemURL(request.params),
          );
        case 'send':
          return successResponse(request.id, await handleSend(request.params));
        default:
          return errorResponse(
            request.id,
            JSON_RPC_ERROR.METHOD_NOT_FOUND,
            `unknown method "${request.method}"`,
          );
      }
    } catch (error) {
      if (error instanceof BridgeRpcError) {
        return errorResponse(request.id, error.code, error.message, error.data);
      }
      const message = error instanceof Error ? error.message : String(error);
      return errorResponse(
        request.id,
        JSON_RPC_ERROR.APPLICATION_ERROR,
        message,
      );
    }
  };

  const dispatch = async (request: unknown): Promise<JsonRpcResponse> => {
    objIdBeforeRequest = nextObjId;
    stagedNames = [];
    const response = await handleRequest(request);
    if ('error' in response) {
      // The client is being told the call failed, so it must not come away
      // able to reach references the result walk minted before giving up.
      // Names are sequential, so an undisclosed one is trivially guessable.
      rollbackNames();
      return response;
    }
    try {
      // A name becomes reachable only for a reply that can actually be sent.
      // `JSON.stringify` still throws on values the walkers do not screen —
      // a bigint, or a circular structure — and that failure has to roll the
      // names back as well, which is why encodability is settled here rather
      // than left to whoever writes the reply. Costs one extra encode per
      // request, which is worth it to keep the two decisions in one place.
      JSON.stringify(response);
    } catch (error) {
      rollbackNames();
      return errorResponse(
        response.id,
        JSON_RPC_ERROR.INTERNAL_ERROR,
        'result could not be encoded as JSON',
        error instanceof Error ? error.message : String(error),
      );
    }
    stagedNames = [];
    return response;
  };

  return { dispatch, resetSession };
}

/**
 * Validate `redeemURL`'s params bag and return the URL string.
 *
 * @param params - The raw `params` field from the request.
 * @returns The validated URL.
 */
function requireUrlString(params: unknown): string {
  if (
    typeof params !== 'object' ||
    params === null ||
    typeof (params as { url?: unknown }).url !== 'string'
  ) {
    throw new BridgeRpcError(
      JSON_RPC_ERROR.INVALID_PARAMS,
      'params.url must be a string',
    );
  }
  return (params as { url: string }).url;
}

/**
 * Validate `send`'s params bag and return the extracted call target,
 * method name, and args array.
 *
 * @param params - The raw `params` field from the request.
 * @returns The validated send arguments; `target` is the NAME (without
 * the `@@` sigil) and `args` defaults to `[]` when omitted.
 */
function requireSendParams(params: unknown): {
  target: string;
  method: string;
  args: unknown[];
} {
  if (typeof params !== 'object' || params === null) {
    throw new BridgeRpcError(
      JSON_RPC_ERROR.INVALID_PARAMS,
      'params must be an object',
    );
  }
  const bag = params as {
    target?: unknown;
    method?: unknown;
    args?: unknown;
  };
  if (typeof bag.target !== 'string') {
    throw new BridgeRpcError(
      JSON_RPC_ERROR.INVALID_PARAMS,
      'params.target must be a string',
    );
  }
  const match = /^@@([A-Za-z0-9]+)$/u.exec(bag.target);
  if (!match) {
    throw new BridgeRpcError(
      JSON_RPC_ERROR.INVALID_PARAMS,
      'params.target must be a marker string like "@@j1"',
    );
  }
  if (typeof bag.method !== 'string') {
    throw new BridgeRpcError(
      JSON_RPC_ERROR.INVALID_PARAMS,
      'params.method must be a string',
    );
  }
  if (bag.args !== undefined && !Array.isArray(bag.args)) {
    throw new BridgeRpcError(
      JSON_RPC_ERROR.INVALID_PARAMS,
      'params.args must be an array',
    );
  }
  return {
    target: match[1] as string,
    method: bag.method,
    args: (bag.args as unknown[] | undefined) ?? [],
  };
}

/**
 * Type-guard for a well-formed JSON-RPC 2.0 request envelope.
 *
 * @param value - Candidate parsed-JSON value.
 * @returns True iff `value` has the required envelope fields.
 */
function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const bag = value as {
    jsonrpc?: unknown;
    method?: unknown;
    id?: unknown;
  };
  if (bag.jsonrpc !== '2.0' || typeof bag.method !== 'string') {
    return false;
  }
  // An `id` is required: a missing one denotes a JSON-RPC notification,
  // which this vat does not serve. Every line in gets exactly one line
  // back, and that invariant is what keeps a persistent line-delimited
  // stream in step — an unanswered request or an unexpected extra reply
  // desynchronizes it permanently, with the client reading each answer as
  // the response to some later request. Notifications would also be
  // pointless here, since both methods exist to return a value.
  //
  // Rejecting also makes the predicate honest: `JsonRpcRequest.id` is
  // `JsonRpcId`, which does not include `undefined`.
  if (
    bag.id !== null &&
    typeof bag.id !== 'number' &&
    typeof bag.id !== 'string'
  ) {
    return false;
  }
  return true;
}

/**
 * Best-effort extraction of the request `id`, used when the request
 * fails validation and must be echoed on the error response.
 *
 * @param value - Candidate parsed-JSON value.
 * @returns The id, or `null` if none is recoverable.
 */
function extractId(value: unknown): JsonRpcId {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { id } = value as { id?: unknown };
  if (id === null || typeof id === 'number' || typeof id === 'string') {
    return id;
  }
  return null;
}

/**
 * Build a JSON-RPC success response.
 *
 * A void method yields `undefined`, which `JSON.stringify` drops entirely —
 * producing a response carrying neither `result` nor `error`, which is
 * well-formed as neither outcome under JSON-RPC 2.0. Normalizing to `null`
 * keeps the success shape intact. Only `undefined` is substituted, so
 * falsy results like `0`, `''`, and `false` are reported as they are.
 *
 * @param id - The request id to echo.
 * @param result - The result payload.
 * @returns The response envelope.
 */
function successResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result: result ?? null };
}

/**
 * Build a JSON-RPC error response.
 *
 * @param id - The request id to echo.
 * @param code - JSON-RPC error code (see `JSON_RPC_ERROR`).
 * @param message - Human-readable error description.
 * @param data - Optional additional error data.
 * @returns The response envelope.
 */
function errorResponse(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  const error: { code: number; message: string; data?: unknown } = {
    code,
    message,
  };
  if (data !== undefined) {
    error.data = data;
  }
  return { jsonrpc: '2.0', id, error };
}
