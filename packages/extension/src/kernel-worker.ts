import './kernel-worker-trusted-prelude.js';
import type { KernelCommand, KernelCommandReply } from '@ocap/kernel';
import { isKernelCommand, KernelCommandMethod } from '@ocap/kernel';
import type { Database } from '@sqlite.org/sqlite-wasm';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

main().catch(console.error);

// We temporarily have the kernel commands split between offscreen and kernel-worker
type KernelWorkerCommand = Extract<
  KernelCommand,
  | { method: typeof KernelCommandMethod.KVSet }
  | { method: typeof KernelCommandMethod.KVGet }
>;

const isKernelWorkerCommand = (value: unknown): value is KernelWorkerCommand =>
  isKernelCommand(value) &&
  (value.method === KernelCommandMethod.KVSet ||
    value.method === KernelCommandMethod.KVGet);

type Queue<Type> = Type[];

type VatId = `v${number}`;
type RemoteId = `r${number}`;
type EndpointId = VatId | RemoteId;

type RefTypeTag = 'o' | 'p';
type RefDirectionTag = '+' | '-';
type InnerKRef = `${RefTypeTag}${number}`;
type InnerERef = `${RefTypeTag}${RefDirectionTag}${number}`;

type KRef = `k${InnerKRef}`;
type VRef = `v${InnerERef}`;
type RRef = `r${InnerERef}`;
type ERef = VRef | RRef;

type CapData = {
  body: string;
  slots: string[];
};

type Message = {
  target: ERef | KRef;
  method: string;
  params: CapData;
};

// Per-endpoint persistent state
type EndpointState<IdType> = {
  name: string;
  id: IdType;
  nextExportObjectIdCounter: number;
  nextExportPromiseIdCounter: number;
  eRefToKRef: Map<ERef, KRef>;
  kRefToERef: Map<KRef, ERef>;
};

type VatState = {
  messagePort: MessagePort;
  state: EndpointState<VatId>;
  source: string;
  kvTable: Map<string, string>;
};

type RemoteState = {
  state: EndpointState<RemoteId>;
  connectToURL: string;
  // more here about maintaining connection...
};

// Kernel persistent state
type KernelObject = {
  owner: EndpointId;
  reachableCount: number;
  recognizableCount: number;
};

type PromiseState = 'unresolved' | 'fulfilled' | 'rejected';

type KernelPromise = {
  decider: EndpointId;
  state: PromiseState;
  referenceCount: number;
  messageQueue: Queue<Message>;
  value: undefined | CapData;
};

// export temporarily to shut up lint whinges about unusedness
export type KernelState = {
  runQueue: Queue<Message>;
  nextVatIdCounter: number;
  vats: Map<VatId, VatState>;
  nextRemoteIdCounter: number;
  remotes: Map<RemoteId, RemoteState>;
  nextKernelObjectIdCounter: number;
  kernelObjects: Map<KRef, KernelObject>;
  nextKernePromiseIdCounter: number;
  kernelPromises: Map<KRef, KernelPromise>;
};

/**
 * Ensure that SQLite is initialized.
 *
 * @returns The SQLite database object.
 */
async function initDB(): Promise<Database> {
  const sqlite3 = await sqlite3InitModule();
  if (sqlite3.oo1.OpfsDb) {
    return new sqlite3.oo1.OpfsDb('/testdb.sqlite', 'cwt');
  }
  console.warn(`OPFS not enabled, database will be ephemeral`);
  return new sqlite3.oo1.DB('/testdb.sqlite', 'cwt');
}

/**
 * The main function for the offscreen script.
 */
async function main(): Promise<void> {
  const db = await initDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT,
      value TEXT,
      PRIMARY KEY(key)
    )
  `);

  const sqlKVGet = db.prepare(`
    SELECT value
    FROM kv
    WHERE key = ?
  `);

  /**
   * Exercise reading from the database.
   *
   * @param key - A key to fetch.
   * @returns The value at that key.
   */
  function kvGet(key: string): string {
    sqlKVGet.bind([key]);
    if (sqlKVGet.step()) {
      const result = sqlKVGet.getString(0);
      if (result) {
        sqlKVGet.reset();
        console.log(`kernel get '${key}' as '${result}'`);
        return result;
      }
    }
    sqlKVGet.reset();
    throw Error(`no record matching key '${key}'`);
  }

  const sqlKVSet = db.prepare(`
    INSERT INTO kv (key, value)
    VALUES (?, ?)
    ON CONFLICT DO UPDATE SET value = excluded.value
  `);

  /**
   * Exercise writing to the database.
   *
   * @param key - A key to assign.
   * @param value - The value to assign to it.
   */
  function kvSet(key: string, value: string): void {
    console.log(`kernel set '${key}' to '${value}'`);
    sqlKVSet.bind([key, value]);
    sqlKVSet.step();
    sqlKVSet.reset();
  }

  /**
   * Reply to the background script.
   *
   * @param method - The message method.
   * @param params - The message params.
   */
  const reply = (
    method: KernelCommandReply['method'],
    params?: KernelCommandReply['params'],
  ): void => {
    postMessage({ method, params });
  };

  /**
   * Cast an unknown problem to an Error object.
   *
   * @param problem - Whatever was caught.
   * @returns The problem if it is an Error, or a new Error with the problem as the cause.
   */
  const asError = (problem: unknown): Error =>
    problem instanceof Error
      ? problem
      : new Error('Unknown', { cause: problem });

  /**
   * Handle a KernelCommand sent from the offscreen.
   *
   * @param command - The KernelCommand to handle.
   * @param command.method - The command method.
   * @param command.params - The command params.
   */
  const handleKernelCommand = ({
    method,
    params,
  }: KernelWorkerCommand): void => {
    switch (method) {
      case KernelCommandMethod.KVSet:
        kvSet(params.key, params.value);
        reply(method, `~~~ set "${params.key}" to "${params.value}" ~~~`);
        break;
      case KernelCommandMethod.KVGet: {
        try {
          const result = kvGet(params);
          reply(method, result);
        } catch (problem) {
          // TODO: marshal
          reply(method, String(asError(problem)));
        }
        break;
      }
      default:
        console.error(
          'kernel worker received unexpected command',
          // @ts-expect-error Runtime does not respect "never".
          { method: method.valueOf(), params },
        );
    }
  };

  // Handle messages from the console service worker
  globalThis.onmessage = async (
    event: MessageEvent<unknown>,
  ): Promise<void> => {
    if (isKernelWorkerCommand(event.data)) {
      handleKernelCommand(event.data);
    } else {
      console.error('Received unexpected message', event.data);
    }
  };
}
