import type {
  ParsedInvocation,
  Provision,
} from '@metamask/kernel-utils/session/provision';
import { assert } from '@metamask/superstruct';
import type { JsonRpcResponse } from '@metamask/utils';
import { assertIsJsonRpcResponse, isJsonRpcFailure } from '@metamask/utils';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';

import {
  CapDataStruct,
  DecisionStruct,
  KernelSessionStruct,
  LaunchSubclusterStruct,
  NullableProvisionStruct,
  ProvisionsArrayStruct,
  VerdictStruct,
} from './structs.ts';
import type { Verdict } from './structs.ts';
import type { CapData, Decision } from './types.ts';

// ─── Minimal socket-RPC client (no @endo dependencies) ───────────────────────

/**
 * Options for {@link sendCommand}.
 */
export type SendCommandOptions = {
  /** The UNIX socket path. */
  socketPath: string;
  /** The RPC method name. */
  method: string;
  /** Optional method parameters. */
  params?: Record<string, unknown> | unknown[] | undefined;
  /** Read timeout in milliseconds (default: no timeout). */
  timeoutMs?: number | undefined;
};

/**
 * @param socketPath - The socket path to connect to.
 * @returns A connected socket.
 */
async function connectSocket(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath, () => {
      socket.removeListener('error', reject);
      resolve(socket);
    });
    socket.on('error', reject);
  });
}

/**
 * @param socket - The socket to write to.
 * @param line - The line to write (without trailing newline).
 */
async function writeLine(socket: Socket, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(`${line}\n`, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * @param socket - The socket to read from.
 * @param timeoutMs - Optional timeout in milliseconds.
 * @returns The line read (without trailing newline).
 */
async function readLine(socket: Socket, timeoutMs?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error('Socket read timed out'));
      }, timeoutMs);
    }

    const onData = (data: Buffer): void => {
      buffer += data.toString();
      const idx = buffer.indexOf('\n');
      if (idx !== -1) {
        cleanup();
        resolve(buffer.slice(0, idx));
      }
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    const onEnd = (): void => {
      cleanup();
      reject(new Error('Socket closed before response received'));
    };

    const onClose = (): void => {
      cleanup();
      reject(new Error('Socket closed before response received'));
    };

    /** Remove listeners registered by this call and clear the timeout. */
    function cleanup(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('end', onEnd);
      socket.removeListener('close', onClose);
    }

    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('end', onEnd);
    socket.once('close', onClose);
  });
}

/**
 * Send a JSON-RPC request to the daemon over a UNIX socket and return the response.
 *
 * Opens a connection, writes one JSON-RPC request line, reads one JSON-RPC
 * response line, then closes the connection. Retries once after a short delay
 * if the connection is rejected.
 *
 * @param options - Command options.
 * @param options.socketPath - The UNIX socket path.
 * @param options.method - The RPC method name.
 * @param options.params - Optional method parameters.
 * @param options.timeoutMs - Read timeout in milliseconds (default: no timeout).
 * @returns The parsed JSON-RPC response.
 */
export async function sendCommand({
  socketPath,
  method,
  params,
  timeoutMs,
}: SendCommandOptions): Promise<JsonRpcResponse> {
  const id = randomUUID();
  const request = {
    jsonrpc: '2.0',
    id,
    method,
    ...(params === undefined ? {} : { params }),
  };

  const attempt = async (): Promise<JsonRpcResponse> => {
    const socket = await connectSocket(socketPath);
    try {
      await writeLine(socket, JSON.stringify(request));
      const responseLine = await readLine(socket, timeoutMs);
      const parsed: unknown = JSON.parse(responseLine);
      assertIsJsonRpcResponse(parsed);
      return parsed;
    } finally {
      socket.destroy();
    }
  };

  try {
    return await attempt();
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code !== 'ECONNREFUSED' && code !== 'ECONNRESET') {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    return attempt();
  }
}

// ─── RPC helpers ──────────────────────────────────────────────────────────────

/**
 * Check whether the daemon is running.
 *
 * @param socketPath - The UNIX socket path.
 * @returns True if the daemon responds to the RPC call.
 */
export async function pingDaemon(socketPath: string): Promise<boolean> {
  try {
    const response = await sendCommand({
      socketPath,
      method: 'getStatus',
      timeoutMs: 3_000,
    });
    return !isJsonRpcFailure(response);
  } catch {
    return false;
  }
}

/**
 * Create a new kernel session and return its ID and OCAP URL.
 *
 * @param socketPath - The UNIX socket path.
 * @param name - Optional session name hint.
 * @returns The new session's ID and OCAP URL.
 */
export async function createKernelSession(
  socketPath: string,
  name?: string,
): Promise<{ sessionId: string; ocapUrl: string }> {
  const params: Record<string, unknown> = {};
  if (name !== undefined) {
    params.name = name;
  }
  const response = await sendCommand({
    socketPath,
    method: 'session.create',
    params,
  });
  if (isJsonRpcFailure(response)) {
    throw new Error(`session.create: ${response.error.message}`);
  }
  const { result } = response;
  assert(result, KernelSessionStruct);
  return result;
}

/**
 * Block until the TUI renders a decision for the described authorization request.
 *
 * @param socketPath - The UNIX socket path.
 * @param kernelSessionId - The kernel session to route the request through.
 * @param description - Human-readable description of the requested operation.
 * @param options - Optional request metadata.
 * @param options.reason - Optional reason for the request.
 * @param options.timeoutMs - Optional client-side timeout in milliseconds.
 * @param options.invocations - Parsed invocations to forward to the TUI for the provision editor.
 * @param options.clauses - Independent pipeline clauses — one per &&/||/; operand.
 * @returns The TUI's decision.
 */
export async function authorizeRequest(
  socketPath: string,
  kernelSessionId: string,
  description: string,
  options?: {
    reason?: string;
    timeoutMs?: number;
    invocations?: ParsedInvocation[];
    clauses?: ParsedInvocation[][];
  },
): Promise<Decision> {
  const params: Record<string, unknown> = {
    sessionId: kernelSessionId,
    description,
  };
  if (options?.reason !== undefined) {
    params.reason = options.reason;
  }
  if (options?.timeoutMs !== undefined) {
    params.timeoutMs = options.timeoutMs;
  }
  if (options?.invocations !== undefined) {
    params.invocations = options.invocations;
  }
  if (options?.clauses !== undefined) {
    params.clauses = options.clauses;
  }
  const response = await sendCommand({
    socketPath,
    method: 'session.authorize',
    params,
    // No client-side timeout — waits for user decision.
  });
  if (isJsonRpcFailure(response)) {
    const error = new Error(response.error.message) as Error & {
      code?: string;
    };
    if (response.error.code !== undefined) {
      error.code = String(response.error.code);
    }
    throw error;
  }
  const { result } = response;
  assert(result, DecisionStruct);
  return result;
}

/**
 * Record a request that was auto-accepted by a standing provision.
 *
 * @param socketPath - The UNIX socket path.
 * @param sessionId - The kernel session ID.
 * @param description - Human-readable description of the auto-accepted operation.
 * @param options - Optional parameters.
 * @param options.invocations - Parsed invocations to forward to the TUI.
 * @param options.clauses - Independent pipeline clauses — one per &&/||/; operand.
 * @param options.provisions - Standing provisions that approved the request (one per clause).
 */
export async function recordProvisioned(
  socketPath: string,
  sessionId: string,
  description: string,
  options?: {
    invocations?: ParsedInvocation[];
    clauses?: ParsedInvocation[][];
    provisions?: Provision[];
  },
): Promise<void> {
  const params: Record<string, unknown> = { sessionId, description };
  if (options?.invocations !== undefined) {
    params.invocations = options.invocations;
  }
  if (options?.clauses !== undefined) {
    params.clauses = options.clauses;
  }
  if (options?.provisions !== undefined) {
    params.provisions = options.provisions;
  }
  await sendCommand({ socketPath, method: 'session.record', params });
}

// ─── Permission-vat operations ────────────────────────────────────────────────

/**
 * Launch a fresh permission-tracker vat and return its root kref.
 *
 * @param socketPath - The UNIX socket path.
 * @param vatBundlePath - Absolute path to the compiled permission-tracker bundle.
 * @returns The root kref and subcluster ID for the new vat.
 */
export async function launchPermissionVat(
  socketPath: string,
  vatBundlePath: string,
): Promise<{ rootKref: string; subclusterId: string }> {
  const response = await sendCommand({
    socketPath,
    method: 'launchSubcluster',
    params: {
      config: {
        bootstrap: 'tracker',
        vats: { tracker: { bundleSpec: `file://${vatBundlePath}` } },
      },
    },
  });
  if (isJsonRpcFailure(response)) {
    throw new Error(`launchSubcluster: ${response.error.message}`);
  }
  const { result } = response;
  assert(result, LaunchSubclusterStruct);
  return result;
}

/**
 * Ask the permission sheaf whether the given invocations are covered.
 *
 * @param options - Vat route options.
 * @param options.socketPath - The UNIX socket path.
 * @param options.rootKref - The vat's root kref.
 * @param options.tool - The tool name.
 * @param options.invocations - The parsed command components.
 * @returns `'allow'` when a section covers the invocations, `'ask'` otherwise.
 */
export async function vatRoute({
  socketPath,
  rootKref,
  tool,
  invocations,
}: {
  socketPath: string;
  rootKref: string;
  tool: string;
  invocations: ParsedInvocation[];
}): Promise<Verdict> {
  const response = await sendCommand({
    socketPath,
    method: 'queueMessage',
    params: [rootKref, 'route', [tool, invocations]],
  });
  if (isJsonRpcFailure(response)) {
    throw new Error(`vatRoute: ${response.error.message}`);
  }
  const { result } = response;
  assert(result, CapDataStruct);
  const decoded: unknown = decodeCapData(result);
  assert(decoded, VerdictStruct);
  return decoded;
}

/**
 * Add a section to the permission sheaf. Used for both exact single-invocation
 * grants and standing provisions.
 *
 * @param options - Vat add-section options.
 * @param options.socketPath - The UNIX socket path.
 * @param options.rootKref - The vat's root kref.
 * @param options.provision - The Provision to add as a new section.
 */
export async function vatAddSection({
  socketPath,
  rootKref,
  provision,
}: {
  socketPath: string;
  rootKref: string;
  provision: Provision;
}): Promise<void> {
  await sendCommand({
    socketPath,
    method: 'queueMessage',
    params: [rootKref, 'addSection', [provision]],
  });
}

/**
 * Return the first provision that matches the given tool and invocations,
 * or null if none match.
 *
 * @param options - Vat find-match options.
 * @param options.socketPath - The UNIX socket path.
 * @param options.rootKref - The vat's root kref.
 * @param options.tool - The tool name.
 * @param options.invocations - The parsed command components.
 * @returns The matching provision, or null.
 */
export async function vatFindMatch({
  socketPath,
  rootKref,
  tool,
  invocations,
}: {
  socketPath: string;
  rootKref: string;
  tool: string;
  invocations: ParsedInvocation[];
}): Promise<Provision | null> {
  const response = await sendCommand({
    socketPath,
    method: 'queueMessage',
    params: [rootKref, 'findMatch', [tool, invocations]],
  });
  if (isJsonRpcFailure(response)) {
    return null;
  }
  const { result } = response;
  assert(result, CapDataStruct);
  const decoded: unknown = decodeSmallcapsStrings(decodeCapData(result));
  assert(decoded, NullableProvisionStruct);
  return decoded;
}

/**
 * Remove the first section in the permission sheaf whose Provision deep-equals
 * the argument. No-op if no section matches.
 *
 * @param options - Vat remove-section options.
 * @param options.socketPath - The UNIX socket path.
 * @param options.rootKref - The vat's root kref.
 * @param options.provision - The Provision to remove.
 * @returns `true` if a section was removed, `false` if none matched.
 */
export async function vatRemoveSection({
  socketPath,
  rootKref,
  provision,
}: {
  socketPath: string;
  rootKref: string;
  provision: Provision;
}): Promise<boolean> {
  const response = await sendCommand({
    socketPath,
    method: 'queueMessage',
    params: [rootKref, 'removeSection', [provision]],
  });
  if (isJsonRpcFailure(response)) {
    throw new Error(`vatRemoveSection: ${response.error.message}`);
  }
  const { result } = response;
  assert(result, CapDataStruct);
  const decoded = decodeCapData(result);
  if (typeof decoded !== 'boolean') {
    throw new Error(
      `vatRemoveSection: expected boolean, got ${typeof decoded}`,
    );
  }
  return decoded;
}

/**
 * Return the version string baked into the running permission-tracker vat.
 *
 * @param socketPath - The UNIX socket path.
 * @param rootKref - The vat's root kref.
 * @returns The vat bundle's version, or `'unknown'` if the vat is an older
 * build that does not implement `getVersion`.
 */
export async function vatGetVersion(
  socketPath: string,
  rootKref: string,
): Promise<string> {
  const response = await sendCommand({
    socketPath,
    method: 'queueMessage',
    params: [rootKref, 'getVersion', []],
  });
  if (isJsonRpcFailure(response)) {
    return 'unknown';
  }
  const { result } = response;
  assert(result, CapDataStruct);
  const decoded = decodeCapData(result);
  return typeof decoded === 'string' ? decoded : 'unknown';
}

/**
 * Return the number of entries in the permission vat's allow set.
 *
 * @param socketPath - The UNIX socket path.
 * @param rootKref - The vat's root kref.
 * @returns The number of granted (toolName, sha) pairs.
 */
export async function vatSize(
  socketPath: string,
  rootKref: string,
): Promise<number> {
  const response = await sendCommand({
    socketPath,
    method: 'queueMessage',
    params: [rootKref, 'size', []],
  });
  if (isJsonRpcFailure(response)) {
    throw new Error(`vatSize: ${response.error.message}`);
  }
  const { result } = response;
  assert(result, CapDataStruct);
  const decoded = decodeCapData(result);
  if (typeof decoded !== 'number') {
    throw new Error(`vatSize: expected number, got ${typeof decoded}`);
  }
  return decoded;
}

/**
 * Return all provisions currently stored in a permission-tracker vat.
 *
 * @param socketPath - The UNIX socket path.
 * @param rootKref - The vat's root kref.
 * @returns The list of provisions, oldest first, or an empty array on error.
 */
export async function listVatProvisions(
  socketPath: string,
  rootKref: string,
): Promise<Provision[]> {
  try {
    const response = await sendCommand({
      socketPath,
      method: 'queueMessage',
      params: [rootKref, 'listProvisions', []],
      timeoutMs: 5_000,
    });
    if (isJsonRpcFailure(response)) {
      return [];
    }
    const { result } = response;
    assert(result, CapDataStruct);
    const decoded: unknown = decodeSmallcapsStrings(decodeCapData(result));
    assert(decoded, ProvisionsArrayStruct);
    return decoded;
  } catch {
    return [];
  }
}

/**
 * Decode a CapData body to a JavaScript value.
 *
 * The kernel uses JSBI encoding via @endo/marshal. For primitive values
 * returned by the permission vat ('allow', 'ask', undefined), the body is
 * prefixed with '#' and then JSON-encoded: string 'allow' → body '#"allow"'.
 *
 * @param capData - The CapData object to decode.
 * @returns The decoded JavaScript value.
 */
export function decodeCapData(capData: CapData): unknown {
  const { body } = capData;
  if (body.startsWith('#')) {
    return JSON.parse(body.slice(1));
  }
  throw new Error(`Unexpected CapData body format: ${body.slice(0, 40)}`);
}

/**
 * Recursively strip the smallcaps `!` escape prefix from string values in a
 * decoded CapData object. In smallcaps encoding, strings that begin with a
 * sigil character (including `-` for negative special floats) are prefixed
 * with `!` to distinguish them from encoding markers. This reversal is needed
 * when decoding complex objects like Provision (whose argv may contain flags
 * like `--oneline` that become `!--oneline` after encoding).
 *
 * @param value - A JSON-parsed smallcaps value.
 * @returns The value with all `!`-escaped strings decoded.
 */
export function decodeSmallcapsStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.startsWith('!') ? value.slice(1) : value;
  }
  if (Array.isArray(value)) {
    return value.map(decodeSmallcapsStrings);
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = decodeSmallcapsStrings(val);
    }
    return result;
  }
  return value;
}

// ─── Injectable RPC client ───────────────────────────────────────────────────

/**
 * The set of RPC operations consumed by hook handlers.
 *
 * Defined as an object type so handlers receive it as a single injected
 * dependency. {@link defaultRpcClient} is the production binding; tests can
 * substitute fakes that record calls and return canned responses.
 */
export type RpcClient = {
  pingDaemon(socketPath: string): Promise<boolean>;
  createKernelSession(
    socketPath: string,
    name?: string,
  ): Promise<{ sessionId: string; ocapUrl: string }>;
  authorizeRequest(
    socketPath: string,
    kernelSessionId: string,
    description: string,
    options?: {
      reason?: string;
      timeoutMs?: number;
      invocations?: ParsedInvocation[];
      clauses?: ParsedInvocation[][];
    },
  ): Promise<Decision>;
  recordProvisioned(
    socketPath: string,
    sessionId: string,
    description: string,
    options?: {
      invocations?: ParsedInvocation[];
      clauses?: ParsedInvocation[][];
      provisions?: Provision[];
    },
  ): Promise<void>;
  launchPermissionVat(
    socketPath: string,
    vatBundlePath: string,
  ): Promise<{ rootKref: string; subclusterId: string }>;
  vatRoute(options: {
    socketPath: string;
    rootKref: string;
    tool: string;
    invocations: ParsedInvocation[];
  }): Promise<Verdict>;
  vatAddSection(options: {
    socketPath: string;
    rootKref: string;
    provision: Provision;
  }): Promise<void>;
  vatFindMatch(options: {
    socketPath: string;
    rootKref: string;
    tool: string;
    invocations: ParsedInvocation[];
  }): Promise<Provision | null>;
  vatRemoveSection(options: {
    socketPath: string;
    rootKref: string;
    provision: Provision;
  }): Promise<boolean>;
  vatSize(socketPath: string, rootKref: string): Promise<number>;
  vatGetVersion(socketPath: string, rootKref: string): Promise<string>;
  listVatProvisions(socketPath: string, rootKref: string): Promise<Provision[]>;
};

export const defaultRpcClient: RpcClient = {
  pingDaemon,
  createKernelSession,
  authorizeRequest,
  recordProvisioned,
  launchPermissionVat,
  vatRoute,
  vatAddSection,
  vatFindMatch,
  vatRemoveSection,
  vatSize,
  vatGetVersion,
  listVatProvisions,
};
