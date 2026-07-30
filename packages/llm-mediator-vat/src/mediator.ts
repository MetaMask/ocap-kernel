/**
 * Mediator core: the state machine and per-request dispatch used by the
 * LLM mediator vat.
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
  MediatorRpcError,
  expandMarkers,
  substituteRemotables,
} from './json-rpc.ts';

export type MediatorHooks = {
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
   * `"@@o<n>"` sigil strings. Production wires this to `passStyleOf`.
   */
  isRemotable: (value: unknown) => boolean;
};

export type Mediator = {
  /**
   * Handle one already-parsed JSON-RPC request and return the response.
   * Never throws; all errors are packaged as JSON-RPC error responses.
   */
  dispatch: (request: unknown) => Promise<JsonRpcResponse>;
  /**
   * Discard the naming tables and revert to the pre-`initialize` state.
   * Invoked by the vat when the socket client disconnects so the next
   * connection begins fresh.
   */
  resetSession: () => void;
};

/**
 * Construct a mediator with fresh, empty naming tables.
 *
 * @param hooks - Callbacks that bridge into the environment (URL
 * redemption, message send, remotable identification).
 * @returns The mediator control interface.
 */
export function makeMediator(hooks: MediatorHooks): Mediator {
  let nameToObj = new Map<string, unknown>();
  let objToName = new Map<unknown, string>();
  let nextObjId = 0;
  let initialized = false;

  const resetSession = (): void => {
    nameToObj = new Map();
    objToName = new Map();
    nextObjId = 0;
    initialized = false;
  };

  const assignName = (obj: unknown): string => {
    const existing = objToName.get(obj);
    if (existing !== undefined) {
      return existing;
    }
    nextObjId += 1;
    const name = `o${nextObjId}`;
    nameToObj.set(name, obj);
    objToName.set(obj, name);
    return name;
  };

  const resolveName = (name: string): unknown => nameToObj.get(name);

  const handleInitialize = async (params: unknown): Promise<unknown> => {
    if (initialized) {
      throw new MediatorRpcError(
        JSON_RPC_ERROR.APPLICATION_ERROR,
        'initialize may only be called once per session',
      );
    }
    // Flip the flag before the await so a second concurrent initialize
    // call is rejected even if this one is still redeeming URLs. The
    // request loop is serial today, but the guarantee should not
    // depend on that.
    initialized = true;
    const urls = requireUrlsArray(params);
    const resolved = await Promise.all(
      urls.map(async (url) => hooks.redeem(url)),
    );
    const refs = resolved.map((obj) => `${MARKER_PREFIX}${assignName(obj)}`);
    return { refs };
  };

  const handleSend = async (params: unknown): Promise<unknown> => {
    if (!initialized) {
      throw new MediatorRpcError(
        JSON_RPC_ERROR.APPLICATION_ERROR,
        'send called before initialize',
      );
    }
    const { target, method, args } = requireSendParams(params);
    const targetObj = resolveName(target);
    if (targetObj === undefined) {
      throw new MediatorRpcError(
        JSON_RPC_ERROR.INVALID_PARAMS,
        `params.target "@@${target}" is not a known reference`,
      );
    }
    const expandedArgs = expandMarkers(args, resolveName) as unknown[];
    const result = await hooks.invoke(targetObj, method, expandedArgs);
    return substituteRemotables(result, hooks.isRemotable, assignName);
  };

  const dispatch = async (request: unknown): Promise<JsonRpcResponse> => {
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
        case 'initialize':
          return successResponse(
            request.id,
            await handleInitialize(request.params),
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
      if (error instanceof MediatorRpcError) {
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

  return { dispatch, resetSession };
}

/**
 * Validate `initialize`'s params bag and return the extracted URL array.
 *
 * @param params - The raw `params` field from the request.
 * @returns The validated URL list.
 */
function requireUrlsArray(params: unknown): string[] {
  if (
    typeof params !== 'object' ||
    params === null ||
    !Array.isArray((params as { urls?: unknown }).urls)
  ) {
    throw new MediatorRpcError(
      JSON_RPC_ERROR.INVALID_PARAMS,
      'params.urls must be an array of strings',
    );
  }
  const { urls } = params as { urls: unknown[] };
  if (!urls.every((item) => typeof item === 'string')) {
    throw new MediatorRpcError(
      JSON_RPC_ERROR.INVALID_PARAMS,
      'params.urls must contain only strings',
    );
  }
  return urls;
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
    throw new MediatorRpcError(
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
    throw new MediatorRpcError(
      JSON_RPC_ERROR.INVALID_PARAMS,
      'params.target must be a string',
    );
  }
  const match = /^@@([A-Za-z0-9]+)$/u.exec(bag.target);
  if (!match) {
    throw new MediatorRpcError(
      JSON_RPC_ERROR.INVALID_PARAMS,
      'params.target must be a marker string like "@@o1"',
    );
  }
  if (typeof bag.method !== 'string') {
    throw new MediatorRpcError(
      JSON_RPC_ERROR.INVALID_PARAMS,
      'params.method must be a string',
    );
  }
  if (bag.args !== undefined && !Array.isArray(bag.args)) {
    throw new MediatorRpcError(
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
  if (
    bag.id !== null &&
    typeof bag.id !== 'number' &&
    typeof bag.id !== 'string' &&
    bag.id !== undefined
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
 * @param id - The request id to echo.
 * @param result - The result payload.
 * @returns The response envelope.
 */
function successResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
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
