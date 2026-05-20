import type { ParsedInvocation } from '@metamask/kernel-utils/session/provision';
import type { JsonRpcResponse } from '@metamask/utils';
import { assertIsJsonRpcResponse, isJsonRpcFailure } from '@metamask/utils';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';

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
  return response.result as { sessionId: string; ocapUrl: string };
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
  return response.result as Decision;
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
