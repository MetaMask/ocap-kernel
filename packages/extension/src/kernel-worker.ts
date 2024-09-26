import './endoify.js';
import { CommandMethod } from '@ocap/utils';
import type { Database } from '@sqlite.org/sqlite-wasm';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

main().catch(console.error);

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
  const oo = sqlite3.oo1;
  if (oo.OpfsDb) {
    return new oo.OpfsDb('/testdb.sqlite', 'cwt');
  }
  console.warn(`OPFS not enabled, database will be ephemeral`);
  return new oo.DB('/testdb.sqlite', 'cwt');
}

/**
 * The main function for the offscreen script.
 */
async function main(): Promise<void> {
  // Hard-code a single iframe for now.
  /*
  const IFRAME_ID = 'default';
  const iframeManager = new IframeManager();
  const iframeReadyP = iframeManager
    .create({ id: IFRAME_ID })
    .then(async () => iframeManager.makeCapTp(IFRAME_ID));
  */

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

  // Handle messages from the console service worker
  onmessage = async (event) => {
    const message = event.data;
    const { method, params } = message;
    console.log('received message: ', method, params);
    switch (method) {
      case CommandMethod.Evaluate:
        reply(CommandMethod.Evaluate, await evaluate(params[0] as string));
        break;
      case CommandMethod.CapTpCall: {
        /*
        const result = await iframeManager.callCapTp(
          IFRAME_ID,
          // @ts-expect-error TODO: Type assertions
          method,
          // @ts-expect-error TODO: Type assertions
          ...params,
        );
        reply(CommandMethod.CapTpCall, JSON.stringify(result, null, 2));
        */
        break;
      }
      case CommandMethod.CapTpInit:
        /*
        await iframeManager.makeCapTp(IFRAME_ID);
        reply(CommandMethod.CapTpInit, '~~~ CapTP Initialized ~~~');
        */
        break;
      case CommandMethod.Ping:
        reply(CommandMethod.Ping, 'pong');
        break;
      case CommandMethod.KVSet: {
        // TODO all this goofing around with type casts could be avoided by giving each CommandMethod value
        // a type def for its params
        const key = params[0] as string;
        const value = params[1] as string;
        kvSet(key, value);
        reply(CommandMethod.KVSet, `~~~ set "${key}" to "${value}" ~~~`);
        break;
      }
      case CommandMethod.KVGet: {
        try {
          const result = kvGet(params[0] as string);
          reply(CommandMethod.KVGet, result);
        } catch (problem) {
          reply(CommandMethod.KVGet, problem as string); // cast is a lie, it really is an Error
        }
        break;
      }
      default:
        console.error(
          `kernel received unexpected method in message: "${method}"`,
        );
    }
  };

  /**
   * Reply to the background script.
   *
   * @param method - The message method.
   * @param params - The message params.
   */
  function reply(method: CommandMethod, params?: string): void {
    postMessage({ method, params });
  }

  /**
   * Evaluate a string in the default iframe.
   *
   * @param _source - The source string to evaluate.
   * @returns The result of the evaluation, or an error message.
   */
  async function evaluate(_source: string): Promise<string> {
    return `Error: evaluate not yet implemented`;
    /*
    try {
      const result = await iframeManager.sendMessage(IFRAME_ID, {
        method: CommandMethod.Evaluate,
        data: source,
      });
      return String(result);
    } catch (error) {
      if (error instanceof Error) {
        return `Error: ${error.message}`;
      }
      return `Error: Unknown error during evaluation.`;
    }
    */
  }
}
