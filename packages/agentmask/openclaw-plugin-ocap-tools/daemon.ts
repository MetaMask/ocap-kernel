/**
 * Daemon communication layer shared by the OpenClaw plugins in this
 * monorepo. Opens a persistent Unix-domain socket to the
 * `ocap-jsonrpc-vat` (see `packages/ocap-jsonrpc-vat`) and speaks
 * line-delimited JSON-RPC 2.0 to it.
 *
 * NOTE: this file is duplicated byte-for-byte between
 * `packages/agentmask/openclaw-plugin-ocap-tools/daemon.ts` and
 * `packages/agentmask/openclaw-plugin-metamask/daemon.ts`, so each plugin
 * stays installable on its own via `openclaw plugins install --link`. Any
 * change to one must be mirrored in the other; `diff -q` between them
 * should always be silent. (There were three copies until the `discovery`
 * and `demo` plugins were unified into `ocap-tools`.)
 */
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type DaemonCaller = {
  redeemUrl(url: string): Promise<string>;
  queueMessage(options: {
    target: string;
    method: string;
    args?: unknown[];
  }): Promise<unknown>;
  /**
   * Tear down the connection. Optional; if the plugin is torn down
   * mid-process, the socket eventually closes anyway when Node exits.
   */
  close(): Promise<void>;
};

/**
 * Daemon callers indexed by socket path, so that openclaw calling
 * `register()` more than once (per subagent, per session boundary, etc.)
 * reuses one connection instead of opening another.
 *
 * This matters because the vat scopes its `@@j<n>` name table to a
 * connection: a reference handed back on one connection cannot be named
 * on any other. A second caller would therefore be unable to use the
 * references the first one obtained — which is exactly what happens to a
 * reviser capability that arrives on one turn and is invoked on the next.
 * The plugin's `contacts` and `services` maps are module-level singletons
 * for the same reason; the connection has to have the same lifetime as
 * the names it hands out.
 */
const callersBySocketPath = new Map<string, DaemonCaller>();

/**
 * Resolve the socket path to use, honouring an explicit override, then
 * `$OCAP_HOME`, then `$HOME/.ocap`.
 *
 * @param explicitPath - Caller-supplied path, if any.
 * @returns The socket path.
 */
function resolveSocketPath(explicitPath?: string): string {
  return (
    explicitPath ??
    join(
      // eslint-disable-next-line n/no-process-env
      process.env.OCAP_HOME ?? join(homedir(), '.ocap'),
      'ocap-jsonrpc.sock',
    )
  );
}

/**
 * Provide the daemon caller for the ocap-jsonrpc-vat's Unix socket,
 * creating one on first use and reusing it thereafter.
 *
 * The connection is opened lazily on the first request and kept open for
 * the process's lifetime. If the vat drops it, the caller reconnects on
 * the next request; every reconnection is a fresh session, so the vat's
 * `@@j<n>` name table starts empty and any plugin state referencing old
 * names is stale.
 *
 * @param options - Connection options.
 * @param options.socketPath - Filesystem path of the vat's socket.
 * Defaults to `$OCAP_HOME/ocap-jsonrpc.sock` (or
 * `$HOME/.ocap/ocap-jsonrpc.sock` if `OCAP_HOME` is unset).
 * @param options.timeoutMs - Per-request timeout in ms. Only consulted
 * when the caller for this socket path is first created.
 * @returns A daemon caller with `redeemUrl`, `queueMessage`, and
 * `close`.
 */
export function makeDaemonCaller(options: {
  socketPath?: string;
  timeoutMs: number;
}): DaemonCaller {
  const socketPath = resolveSocketPath(options.socketPath);
  const existing = callersBySocketPath.get(socketPath);
  if (existing) {
    return existing;
  }
  const caller = buildDaemonCaller(socketPath, options.timeoutMs);
  callersBySocketPath.set(socketPath, caller);
  return caller;
}

/**
 * Build a fresh daemon caller for a socket path.
 *
 * @param socketPath - Filesystem path of the vat's socket.
 * @param timeoutMs - Per-request timeout in ms.
 * @returns The daemon caller.
 */
function buildDaemonCaller(
  socketPath: string,
  timeoutMs: number,
): DaemonCaller {
  let socket: Socket | null = null;
  let recvBuffer = '';
  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (response: JsonRpcResponse) => void;
      reject: (cause: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  /**
   * Drop the current socket and reject all in-flight requests.
   *
   * @param cause - The error to reject pending requests with. Defaults
   * to a generic "connection closed" error.
   */
  function tearDown(cause?: Error): void {
    const rejection = cause ?? new Error('ocap-jsonrpc socket closed');
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(rejection);
    }
    pending.clear();
    if (socket) {
      socket.removeAllListeners();
      socket.destroy();
      socket = null;
    }
    recvBuffer = '';
  }

  /**
   * Parse incoming socket bytes and dispatch complete lines to their
   * pending promises.
   *
   * @param chunk - Raw bytes from the socket.
   */
  function onData(chunk: Buffer | string): void {
    recvBuffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let newlineIndex = recvBuffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = recvBuffer.slice(0, newlineIndex);
      recvBuffer = recvBuffer.slice(newlineIndex + 1);
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // Malformed line — the vat is well-behaved so this only
        // happens on socket corruption we can't recover from. Skip.
        newlineIndex = recvBuffer.indexOf('\n');
        continue;
      }
      const response = parsed as JsonRpcResponse;
      const entry = pending.get(response.id);
      if (entry) {
        pending.delete(response.id);
        clearTimeout(entry.timer);
        entry.resolve(response);
      }
      newlineIndex = recvBuffer.indexOf('\n');
    }
  }

  /**
   * Ensure a live socket is available, opening a new one if needed.
   *
   * @returns The live socket.
   */
  async function connect(): Promise<Socket> {
    if (socket && !socket.destroyed) {
      return socket;
    }
    return new Promise<Socket>((resolve, reject) => {
      const conn = createConnection(socketPath);
      // Don't let this socket vote to keep the process alive. The
      // gateway has its own reasons to stay up, but `openclaw plugins
      // install` also runs `register()` — which eagerly pre-redeems
      // over this socket — and would otherwise hang forever at exit
      // with nothing left to do but a live handle.
      conn.unref();
      conn.setEncoding('utf8');
      const onError = (cause: Error): void => {
        conn.removeAllListeners();
        conn.destroy();
        reject(cause);
      };
      conn.once('error', onError);
      conn.once('connect', () => {
        conn.removeListener('error', onError);
        conn.on('data', onData);
        conn.on('close', () => tearDown());
        conn.on('error', (cause: Error) => tearDown(cause));
        socket = conn;
        resolve(conn);
      });
    });
  }

  /**
   * Send a JSON-RPC request and await its matching response line.
   *
   * @param method - The method name.
   * @param params - The method params.
   * @returns The parsed response envelope.
   */
  async function call(
    method: string,
    params: unknown,
  ): Promise<JsonRpcResponse> {
    const conn = await connect();
    const id = nextId;
    nextId += 1;
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(`ocap-jsonrpc ${method} timed out after ${timeoutMs}ms`),
        );
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      conn.write(`${JSON.stringify(request)}\n`, (writeError) => {
        if (writeError) {
          pending.delete(id);
          clearTimeout(timer);
          reject(writeError);
        }
      });
    });
  }

  /**
   * Unwrap a JSON-RPC response into its result value or throw an
   * error whose message carries the response's error message.
   *
   * @param response - The JSON-RPC response envelope.
   * @param label - Human-readable operation label used in error text.
   * @returns The response's result value.
   */
  function unwrap(response: JsonRpcResponse, label: string): unknown {
    if (response.error) {
      throw new Error(`${label} failed: ${response.error.message}`);
    }
    return response.result;
  }

  const caller: DaemonCaller = {
    async redeemUrl(url: string): Promise<string> {
      const response = await call('redeemURL', { url });
      const result = unwrap(response, `redeemURL ${url}`);
      if (typeof result !== 'string') {
        throw new Error(
          `redeemURL returned unexpected value: ${JSON.stringify(result)}`,
        );
      }
      return result;
    },

    async queueMessage(msgOptions: {
      target: string;
      method: string;
      args?: unknown[];
    }): Promise<unknown> {
      const response = await call('send', {
        target: msgOptions.target,
        method: msgOptions.method,
        args: msgOptions.args ?? [],
      });
      return unwrap(response, `send ${msgOptions.method}`);
    },

    async close(): Promise<void> {
      // Stop handing this caller out, so a later makeDaemonCaller builds
      // a live one rather than returning a torn-down husk.
      if (callersBySocketPath.get(socketPath) === caller) {
        callersBySocketPath.delete(socketPath);
      }
      tearDown(new Error('daemon caller closed'));
    },
  };

  return caller;
}
