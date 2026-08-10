/**
 * Test helpers for driving the vat's accept loop against stand-in
 * endowments. The vat only ever sees `accept()`, `read()`, `write()`, and
 * `close()`, so a plain-object listener is enough to exercise the real
 * wiring without a kernel.
 */

/**
 * Create a mock baggage store.
 *
 * @returns A mock baggage with Map semantics plus an `init` method.
 */
export function makeMockBaggage(): Map<string, unknown> & {
  init: (key: string, value: unknown) => void;
} {
  const store = new Map<string, unknown>();
  return Object.assign(store, {
    init(key: string, value: unknown) {
      if (store.has(key)) {
        throw new Error(`Key already exists: ${key}`);
      }
      store.set(key, value);
    },
  });
}

export type MockConnection = {
  /** The connection as the vat sees it. */
  connection: {
    read: () => Promise<string | null>;
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
  };
  /** Every line the vat has written, in order. */
  written: string[];
  /** Parsed view of `written`, for assertions. */
  replies: () => Record<string, unknown>[];
  /** Whether the vat has closed this connection. */
  isClosed: () => boolean;
};

/**
 * Create a mock connection that serves `lines` and then reports EOF.
 *
 * @param lines - Request lines to hand to the vat, in order.
 * @param options - Behavior options.
 * @param options.stall - When true, `read()` never settles once `lines` is
 * drained, standing in for a peer that has gone quiet without hanging up.
 * A stalled connection is what proves serving does not block accepting.
 * @returns The connection plus inspection hooks.
 */
export function makeMockConnection(
  lines: string[],
  { stall = false }: { stall?: boolean } = {},
): MockConnection {
  const pending = [...lines];
  const written: string[] = [];
  let closed = false;
  return {
    written,
    replies: () =>
      written.map((line) => JSON.parse(line) as Record<string, unknown>),
    isClosed: () => closed,
    connection: {
      read: async (): Promise<string | null> => {
        const next = pending.shift();
        if (next !== undefined) {
          return next;
        }
        if (stall) {
          return new Promise<string | null>(() => undefined);
        }
        return null;
      },
      write: async (data: string): Promise<void> => {
        written.push(data);
      },
      close: async (): Promise<void> => {
        closed = true;
      },
    },
  };
}

/**
 * Create a mock `IOListener` that hands out `connections` in order and then
 * reports closure by resolving `null`.
 *
 * @param connections - The connections to yield from `accept()`.
 * @returns The listener plus a count of `accept()` calls.
 */
export function makeMockListener(connections: MockConnection[]): {
  socket: { accept: () => Promise<MockConnection['connection'] | null> };
  acceptCount: () => number;
} {
  const queue = [...connections];
  let accepts = 0;
  return {
    acceptCount: () => accepts,
    socket: {
      accept: async (): Promise<MockConnection['connection'] | null> => {
        accepts += 1;
        const next = queue.shift();
        return next ? next.connection : null;
      },
    },
  };
}

/**
 * Build a JSON-RPC request line.
 *
 * @param id - The request id.
 * @param method - The method to call.
 * @param params - The params bag.
 * @returns The encoded request line.
 */
export function requestLine(
  id: number | string,
  method: string,
  params: unknown,
): string {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params });
}
