import { RpcService } from '@metamask/kernel-rpc-methods';
import type { KernelDatabase } from '@metamask/kernel-store';
import { ifDefined } from '@metamask/kernel-utils';
import type {
  ParsedInvocation,
  Provision,
} from '@metamask/kernel-utils/session';
import type { Kernel } from '@metamask/ocap-kernel';
import { rpcHandlers } from '@metamask/ocap-kernel/rpc';
import { unlink } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import type { Server } from 'node:net';

import type { Session, SessionRegistry } from './session-registry.ts';
import type { ChannelFactory } from '../modal/index.ts';

/**
 * Handle returned by {@link startRpcSocketServer}.
 */
export type RpcSocketServerHandle = {
  close: () => Promise<void>;
};

/**
 * Start a Unix socket server that processes JSON-RPC requests through RpcService.
 *
 * Each connection reads one newline-delimited JSON-RPC request, processes it
 * via the kernel's RPC handlers, writes a JSON-RPC response, and closes.
 *
 * The special `shutdown` method is intercepted before RPC dispatch and triggers
 * the provided {@link onShutdown} callback (if any) after responding to the client.
 *
 * @param options - Server options.
 * @param options.socketPath - The Unix socket path to listen on.
 * @param options.kernel - The kernel instance.
 * @param options.kernelDatabase - The kernel database instance.
 * @param options.channelFactory - The channel factory for modal sessions.
 * @param options.onShutdown - Optional callback invoked when a `shutdown` RPC is received.
 * @param options.sessionRegistry - The session registry for `session.*` RPC methods.
 * @returns A handle with a `close()` function for cleanup.
 */
export async function startRpcSocketServer({
  socketPath,
  kernel,
  kernelDatabase,
  channelFactory,
  sessionRegistry,
  onShutdown,
}: {
  socketPath: string;
  kernel: Kernel;
  kernelDatabase: KernelDatabase;
  channelFactory: ChannelFactory;
  sessionRegistry: SessionRegistry;
  onShutdown?: (() => Promise<void>) | undefined;
}): Promise<RpcSocketServerHandle> {
  const rpcService = new RpcService(rpcHandlers, {
    kernel,
    channelFactory,
    executeDBQuery: (sql: string) => kernelDatabase.executeQuery(sql),
  });

  const server = createServer((socket) => {
    let buffer = '';

    const onData = (data: Buffer): void => {
      buffer += data.toString();
      const idx = buffer.indexOf('\n');
      if (idx === -1) {
        return;
      }

      // One request per connection — stop listening for further data.
      socket.removeListener('data', onData);

      const line = buffer.slice(0, idx);
      const remaining = buffer.slice(idx + 1);
      buffer = '';

      if (remaining.length > 0) {
        socket.end(
          `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Only one request per connection is allowed' } })}\n`,
        );
        return;
      }

      handleRequest(rpcService, sessionRegistry, line, onShutdown)
        .then((response) => {
          socket.end(`${JSON.stringify(response)}\n`);
          return undefined;
        })
        .catch(() => {
          socket.end(
            `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } })}\n`,
          );
        });
    };
    socket.on('data', onData);

    socket.on('error', () => {
      // Ignore client socket errors (e.g. broken pipe from probe connections)
    });
  });

  await listen(server, socketPath);

  return {
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}

/**
 * Handle a single JSON-RPC request line, intercepting `shutdown` and `session.*` methods.
 *
 * `shutdown` is handled inline; `session.*` are dispatched to the session registry;
 * all other methods are delegated to {@link processRequest}.
 *
 * @param rpcService - The RPC service to execute methods against.
 * @param sessionRegistry - The session registry for session namespace methods.
 * @param line - The raw JSON line from the socket.
 * @param onShutdown - Optional shutdown callback.
 * @returns A JSON-RPC response object.
 */
async function handleRequest(
  rpcService: RpcService<typeof rpcHandlers>,
  sessionRegistry: SessionRegistry,
  line: string,
  onShutdown?: () => Promise<void>,
): Promise<Record<string, unknown>> {
  try {
    const request = JSON.parse(line) as {
      id?: unknown;
      method?: string;
      params?: unknown;
    };
    const id = request.id ?? null;

    if (request.method === 'shutdown') {
      // Schedule shutdown after responding to the client.
      if (onShutdown) {
        setTimeout(() => {
          onShutdown().catch(() => {
            // Best-effort shutdown — errors are logged by the caller.
          });
        }, 0);
      }
      return { jsonrpc: '2.0', id, result: { status: 'shutting down' } };
    }

    if (
      typeof request.method === 'string' &&
      request.method.startsWith('session.')
    ) {
      return handleSessionRequest(
        sessionRegistry,
        id,
        request.method,
        request.params,
      );
    }
  } catch {
    // Fall through to processRequest which handles parse errors.
  }

  return processRequest(rpcService, line);
}

/**
 * Error thrown by session RPC helpers when input is invalid or the session is
 * not found. Carries a JSON-RPC error code so the outer handler can preserve
 * the specific code rather than collapsing it to -32603.
 */
class SessionRpcError extends Error {
  readonly code: number;

  /**
   * @param code - JSON-RPC error code.
   * @param message - Human-readable error message.
   */
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Dispatch a `session.*` RPC method to the session registry.
 *
 * @param sessionRegistry - The session registry.
 * @param id - The JSON-RPC request id.
 * @param method - The full method name (e.g. `session.create`).
 * @param params - The raw params from the request.
 * @returns A JSON-RPC response object.
 */
async function handleSessionRequest(
  sessionRegistry: SessionRegistry,
  id: unknown,
  method: string,
  params: unknown,
): Promise<Record<string, unknown>> {
  const ok = (result: unknown): Record<string, unknown> => ({
    jsonrpc: '2.0',
    id,
    result: result ?? null,
  });
  const fail = (code: number, message: string): Record<string, unknown> => ({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  });

  try {
    const args = (params ?? {}) as Record<string, unknown>;

    const requireSession = (sessionId: unknown): Session => {
      if (typeof sessionId !== 'string') {
        throw new SessionRpcError(
          -32602,
          `${method} requires string sessionId`,
        );
      }
      const found = sessionRegistry.getSession(sessionId);
      if (found === undefined) {
        throw new SessionRpcError(-32602, `Session not found: ${sessionId}`);
      }
      return found;
    };

    switch (method) {
      case 'session.create': {
        const name = typeof args.name === 'string' ? args.name : undefined;
        const cwd = typeof args.cwd === 'string' ? args.cwd : undefined;
        const session = await sessionRegistry.createSession({
          ...ifDefined({ name }),
          ...ifDefined({ cwd }),
        });
        return ok({
          sessionId: session.sessionId,
          ocapUrl: session.ocapUrl,
          ...ifDefined({ cwd: session.cwd }),
          startedAt: session.startedAt,
        });
      }

      case 'session.list': {
        return ok(
          sessionRegistry.listSessions().map((sess) => ({
            sessionId: sess.sessionId,
            ocapUrl: sess.ocapUrl,
            ...ifDefined({ cwd: sess.cwd }),
            startedAt: sess.startedAt,
          })),
        );
      }

      case 'session.get': {
        const session = requireSession(args.sessionId);
        return ok({
          sessionId: session.sessionId,
          ocapUrl: session.ocapUrl,
          ...ifDefined({ cwd: session.cwd }),
          startedAt: session.startedAt,
        });
      }

      case 'session.requests': {
        const session = requireSession(args.sessionId);
        return ok(session.listPending());
      }

      case 'session.history': {
        const session = requireSession(args.sessionId);
        return ok(session.listHistory());
      }

      case 'session.queue': {
        const session = requireSession(args.sessionId);
        const description =
          typeof args.description === 'string'
            ? args.description
            : 'Test request';
        const reason =
          typeof args.reason === 'string' ? args.reason : undefined;
        const token = session.queueRequest(description, reason);
        return ok({ token });
      }

      case 'session.authorize': {
        const session = requireSession(args.sessionId);
        const description =
          typeof args.description === 'string'
            ? args.description
            : 'Authorization request';
        const reason =
          typeof args.reason === 'string' ? args.reason : undefined;
        const timeoutMs =
          typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined;
        const invocations = Array.isArray(args.invocations)
          ? (args.invocations as ParsedInvocation[])
          : undefined;
        const clauses = Array.isArray(args.clauses)
          ? (args.clauses as ParsedInvocation[][])
          : undefined;
        const decision = await session.authorizeRequest(description, {
          ...ifDefined({ reason }),
          ...ifDefined({ timeoutMs }),
          ...ifDefined({ invocations }),
          ...ifDefined({ clauses }),
        });
        return ok(decision);
      }

      case 'session.record': {
        const session = requireSession(args.sessionId);
        const description =
          typeof args.description === 'string'
            ? args.description
            : 'Auto-accepted request';
        const invocations = Array.isArray(args.invocations)
          ? (args.invocations as ParsedInvocation[])
          : undefined;
        const provisions = Array.isArray(args.provisions)
          ? (args.provisions as Provision[])
          : undefined;
        const clauses = Array.isArray(args.clauses)
          ? (args.clauses as ParsedInvocation[][])
          : undefined;
        session.recordProvisioned(description, {
          ...ifDefined({ invocations }),
          ...ifDefined({ clauses }),
          ...ifDefined({ provisions }),
        });
        return ok(null);
      }

      case 'session.decide': {
        const session = requireSession(args.sessionId);
        const { token } = args;
        const { verdict } = args;
        const feedback = typeof args.feedback === 'string' ? args.feedback : '';
        const guard =
          typeof args.guard === 'object' && args.guard !== null
            ? (args.guard as { body: string; slots: string[] })
            : undefined;
        const provisions = Array.isArray(args.provisions)
          ? (args.provisions as Provision[])
          : undefined;

        if (
          typeof token !== 'string' ||
          (verdict !== 'accept' && verdict !== 'reject')
        ) {
          throw new SessionRpcError(
            -32602,
            'session.decide requires string token and verdict ("accept"|"reject")',
          );
        }
        session.decide({
          token,
          verdict,
          feedback,
          ...ifDefined({ guard }),
          ...ifDefined({ provisions }),
        });
        return ok(null);
      }

      default:
        throw new SessionRpcError(-32601, `Method not found: ${method}`);
    }
  } catch (error) {
    if (error instanceof SessionRpcError) {
      return fail(error.code, error.message);
    }
    const message = error instanceof Error ? error.message : 'Internal error';
    return fail(-32603, message);
  }
}

/**
 * Process a single JSON-RPC request line and return a JSON-RPC response.
 *
 * @param rpcService - The RPC service to execute methods against.
 * @param line - The raw JSON line from the socket.
 * @returns A JSON-RPC response object.
 */
async function processRequest(
  rpcService: RpcService<typeof rpcHandlers>,
  line: string,
): Promise<Record<string, unknown>> {
  let id: unknown = null;

  try {
    const request = JSON.parse(line) as {
      jsonrpc?: string;
      id?: unknown;
      method?: string;
      params?: unknown;
    };
    id = request.id ?? null;

    const { method } = request;
    // Default to empty array when no params provided (handlers expect validated params)
    const params = request.params ?? [];

    if (typeof method !== 'string') {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid request: missing method' },
      };
    }

    rpcService.assertHasMethod(method);
    const result = await rpcService.execute(method, params);

    return { jsonrpc: '2.0', id, result: result ?? null };
  } catch (error) {
    const code = isRpcError(error) ? error.code : -32603;
    const message = error instanceof Error ? error.message : 'Internal error';

    return { jsonrpc: '2.0', id, error: { code, message } };
  }
}

/**
 * Check if an error is an RPC error with a numeric code.
 *
 * @param error - The error to check.
 * @returns True if the error has a numeric code property.
 */
function isRpcError(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'number'
  );
}

/**
 * Probe whether a Unix socket file already has a live listener.
 *
 * Used as an interlock before binding: if a previous daemon is still
 * running, blindly unlinking the socket would orphan it (the old process
 * keeps running, but the CLI loses the ability to find it). Better to
 * fail loudly and let the operator decide.
 *
 * @param socketPath - The Unix socket path.
 * @returns True if a connection succeeds (the socket has a live owner),
 * false if the file is missing or the connect attempt is refused.
 */
async function isSocketLive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection(socketPath);
    let settled = false;
    const finalize = (live: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(live);
    };
    socket.once('connect', () => finalize(true));
    socket.once('error', () => finalize(false));
    setTimeout(() => finalize(false), 1000);
  });
}

/**
 * Start listening on a Unix socket path.
 *
 * Refuses to take over a socket that has a live listener — orphaning the
 * previous daemon would leave it holding `kernel.sqlite` locks and other
 * resources with no easy way to find it again. A stale socket file with
 * no listener is treated as cleanup-eligible and unlinked.
 *
 * @param server - The net.Server instance.
 * @param socketPath - The Unix socket path.
 */
async function listen(server: Server, socketPath: string): Promise<void> {
  if (await isSocketLive(socketPath)) {
    throw new Error(
      `Daemon is already running on ${socketPath}. ` +
        `Use 'ocap daemon stop' first.`,
    );
  }
  // Stale socket file from a previous run — clean up. Only swallow
  // ENOENT (file already absent). Other errors (EPERM, EACCES, EBUSY,
  // EISDIR if someone replaced the socket with a directory) need to
  // surface; otherwise the subsequent `server.listen()` would fail with
  // an opaque EADDRINUSE that hides the real cause.
  try {
    await unlink(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}
