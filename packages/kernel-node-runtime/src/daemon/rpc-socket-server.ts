import { RpcService } from '@metamask/kernel-rpc-methods';
import type { KernelDatabase } from '@metamask/kernel-store';
import type { Kernel } from '@metamask/ocap-kernel';
import { rpcHandlers } from '@metamask/ocap-kernel/rpc';
import { chmod, unlink } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import type { Server } from 'node:net';

/**
 * Handle returned by {@link startRpcSocketServer}.
 */
export type RpcSocketServerHandle = {
  close: () => Promise<void>;
};

/**
 * Methods withheld unless the daemon is started in dev mode.
 *
 * `executeDBQuery` is the one that matters: it runs caller-supplied SQL
 * against kernel state, which is indispensable while debugging and
 * indefensible in a deployment. `clearState` comes along because it is the
 * whole-kernel `reset()`, and `terminateAllVats` for symmetry with it.
 *
 * The criterion is blast radius, not destructiveness: per-vat operations
 * (`terminateVat`, `terminateSubcluster`, `revoke`) are part of normal
 * operation and stay reachable.
 *
 * This is not a security boundary on its own — `launchSubcluster` and
 * `queueMessage` remain reachable, and either is enough to drive the kernel
 * arbitrarily. See the trust model in `kernel-cli`'s README: anyone who can
 * open this socket controls the kernel. Withholding these three removes the
 * raw-SQL surface, nothing more.
 *
 * `satisfies` ties the list to the real handler set, so renaming a method
 * fails the build here instead of silently un-gating it.
 */
export const DEV_ONLY_METHODS = [
  'executeDBQuery',
  'clearState',
  'terminateAllVats',
] as const satisfies readonly (keyof typeof rpcHandlers)[];

type DevOnlyMethod = (typeof DEV_ONLY_METHODS)[number];

const isDevOnlyMethod = (method: string): method is DevOnlyMethod =>
  (DEV_ONLY_METHODS as readonly string[]).includes(method);

/**
 * Dispatch a method by name, or throw if it is not registered.
 *
 * Closing over the `RpcService` lets each mode keep its own handler-set
 * type; the two services differ in their `Handlers` type argument, so
 * neither is assignable to the other.
 */
type RpcDispatch = (method: string, params: unknown) => Promise<unknown>;

/**
 * Build the dispatcher for the requested mode.
 *
 * Production mode withholds the handlers themselves rather than merely
 * refusing the method names, so the `executeDBQuery` hook is never
 * constructed and no handler can reach `kernelDatabase.executeQuery`. The
 * kernel still holds the database, of course — this closes the raw-SQL
 * surface, not database access as such.
 *
 * @param options - Dispatcher options.
 * @param options.kernel - The kernel instance.
 * @param options.kernelDatabase - The kernel database instance. Used only
 * when `devMode` is true.
 * @param options.devMode - Whether to include the dev-only handlers.
 * @returns A function that executes a method by name.
 */
function makeDispatch({
  kernel,
  kernelDatabase,
  devMode,
}: {
  kernel: Kernel;
  kernelDatabase: KernelDatabase;
  devMode: boolean;
}): RpcDispatch {
  if (devMode) {
    const service: RpcService<typeof rpcHandlers> = new RpcService(
      rpcHandlers,
      {
        kernel,
        executeDBQuery: (sql: string) => kernelDatabase.executeQuery(sql),
      },
    );
    return async (method, params) => {
      service.assertHasMethod(method);
      return service.execute(method, params);
    };
  }

  const productionHandlers = Object.fromEntries(
    Object.entries(rpcHandlers).filter(([method]) => !isDevOnlyMethod(method)),
  ) as Omit<typeof rpcHandlers, DevOnlyMethod>;
  const service: RpcService<Omit<typeof rpcHandlers, DevOnlyMethod>> =
    new RpcService(productionHandlers, { kernel });
  return async (method, params) => {
    service.assertHasMethod(method);
    return service.execute(method, params);
  };
}

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
 * @param options.onShutdown - Optional callback invoked when a `shutdown` RPC is received.
 * @param options.devMode - When true, also serve {@link DEV_ONLY_METHODS}.
 *   Defaults to false.
 * @returns A handle with a `close()` function for cleanup.
 */
export async function startRpcSocketServer({
  socketPath,
  kernel,
  kernelDatabase,
  onShutdown,
  devMode = false,
}: {
  socketPath: string;
  kernel: Kernel;
  kernelDatabase: KernelDatabase;
  onShutdown?: (() => Promise<void>) | undefined;
  devMode?: boolean;
}): Promise<RpcSocketServerHandle> {
  const dispatch = makeDispatch({ kernel, kernelDatabase, devMode });

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

      handleRequest({ dispatch, line, devMode, onShutdown })
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
 * Handle a single JSON-RPC request line, intercepting the `shutdown` method.
 *
 * If the method is `shutdown` and an `onShutdown` callback is provided, the
 * callback is scheduled (without awaiting) after a successful response is
 * returned. All other methods are delegated to {@link processRequest}.
 *
 * @param options - Request options.
 * @param options.dispatch - Executes a method by name.
 * @param options.line - The raw JSON line from the socket.
 * @param options.devMode - Whether dev-only methods are permitted.
 * @param options.onShutdown - Optional shutdown callback.
 * @returns A JSON-RPC response object.
 */
async function handleRequest({
  dispatch,
  line,
  devMode,
  onShutdown,
}: {
  dispatch: RpcDispatch;
  line: string;
  devMode: boolean;
  onShutdown?: (() => Promise<void>) | undefined;
}): Promise<Record<string, unknown>> {
  try {
    const request = JSON.parse(line) as {
      id?: unknown;
      method?: string;
    };

    if (request.method === 'shutdown') {
      const id = request.id ?? null;
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
  } catch {
    // Fall through to processRequest which handles parse errors.
  }

  return processRequest({ dispatch, line, devMode });
}

/**
 * Process a single JSON-RPC request line and return a JSON-RPC response.
 *
 * @param options - Request options.
 * @param options.dispatch - Executes a method by name.
 * @param options.line - The raw JSON line from the socket.
 * @param options.devMode - Whether dev-only methods are permitted.
 * @returns A JSON-RPC response object.
 */
async function processRequest({
  dispatch,
  line,
  devMode,
}: {
  dispatch: RpcDispatch;
  line: string;
  devMode: boolean;
}): Promise<Record<string, unknown>> {
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

    // `dispatch` would already refuse these — the handlers aren't registered.
    // This branch exists only to name the flag, because "Method not found"
    // for a method the operator can see in the source is a debugging trap.
    if (!devMode && isDevOnlyMethod(method)) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: '${method}' is served only when the daemon runs with OCAP_DEV_MODE=true`,
        },
      };
    }

    const result = await dispatch(method, params);

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

  await bind(server, socketPath);

  // `bind`'s umask may not have applied — `process.umask` throws on a worker
  // thread — so chmod is what actually guarantees the mode.
  try {
    await chmod(socketPath, 0o600);
  } catch (error) {
    // A socket whose mode we can't narrow is a socket any local user can
    // drive, so refuse to serve on it rather than leave it listening.
    // Not awaited: `close()` unlinks the socket path synchronously, but its
    // callback waits for every accepted connection to end — and a client that
    // connected during the bind→chmod window need never send anything, which
    // would hang startup here instead of surfacing this error.
    server.close();
    throw new Error(
      `Refusing to serve on ${socketPath}: could not restrict it to 0600.`,
      { cause: error },
    );
  }
}

/**
 * Bind the server, creating the socket file with no group or other bits.
 *
 * The filesystem is this socket's only access control, and `listen()`
 * otherwise binds at `0777 & ~umask` — 0775 under a group-writable umask,
 * 0777 under 000. Connecting requires write permission, so a lax ambient
 * umask leaves a window before the chmod above in which other local users
 * could connect. Callers may place the socket outside a private directory
 * (`kernel-cli` exposes `$OCAP_SOCKET_PATH` for exactly that), so the parent
 * directory can't be relied on to close that window.
 *
 * @param server - The net.Server instance.
 * @param socketPath - The Unix socket path.
 */
async function bind(server: Server, socketPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    // Best-effort: `process.umask` throws on a worker thread. The chmod in
    // `listen` is what guarantees the mode, so a caller running the server
    // off the main thread keeps the narrow bind→chmod window rather than
    // losing the server. `listen` binds synchronously, so the umask is
    // restored before any await — it is process-global, and holding it
    // would narrow unrelated files created meanwhile.
    let previousUmask: number | undefined;
    try {
      previousUmask = process.umask(0o177);
    } catch {
      previousUmask = undefined;
    }
    try {
      server.listen(socketPath, () => {
        server.removeListener('error', reject);
        resolve();
      });
    } finally {
      if (previousUmask !== undefined) {
        process.umask(previousUmask);
      }
    }
  });
}
