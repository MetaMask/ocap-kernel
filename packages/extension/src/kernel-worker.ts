import type { Database } from '@sqlite.org/sqlite-wasm';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import './endoify.js';

//import { IframeManager } from './iframe-manager.js';
import { IframeMessage, Command } from './message.js';
import { makeHandledCallback } from './shared.js';

main().catch(console.error);

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
  } else {
    console.warn(`OPFS not enabled, database will be ephemeral`);
    return new oo.DB('/testdb.sqlite', 'cwt');
  }
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

  //await iframeReadyP;

  // Handle messages from the console service worker
  onmessage = async (event) => {
    const message = event.data as IframeMessage;
    const { type, data } = message;
    console.log('received message: ', type, data);
    switch (type) {
      case Command.Evaluate:
        reply(Command.Evaluate, await evaluate(data as string));
        break;
      case Command.CapTpCall: {
        /*
        const result = await iframeManager.callCapTp(
          IFRAME_ID,
          // @ts-expect-error TODO: Type assertions
          data.method,
          // @ts-expect-error TODO: Type assertions
          ...data.params,
        );
        reply(Command.CapTpCall, JSON.stringify(result, null, 2));
        */
        break;
      }
      case Command.CapTpInit:
        /*
        await iframeManager.makeCapTp(IFRAME_ID);
        reply(Command.CapTpInit, '~~~ CapTP Initialized ~~~');
        */
        break;
      case Command.Ping:
        reply(Command.Ping, 'pong');
        break;
      case Command.KVSet: {
        // TODO all this goofing around with type casts could be avoided by giving each Command value
        // a type def for its params
        const arg = data as Record<string, unknown>;
        const key = arg.key as string;
        const value = arg.value as string;
        kvSet(key, value);
        reply(Command.KVSet, `~~~ set "${key}" to "${value}" ~~~`);
        break;
      }
      case Command.KVGet: {
        try {
          const result = kvGet(data as string);
          reply(Command.KVGet, result);
        } catch (problem) {
          reply(Command.KVGet, problem as string); // cast is a lie, it really is an Error
        }
        break;
      }
      default:
        console.error(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `kernel received unexpected message type: "${type}"`,
        );
    }
  };

  /**
   * Reply to the background script.
   *
   * @param type - The message type.
   * @param data - The message data.
   */
  function reply(type: Command, data?: string): void {
    postMessage({ type, data });
  }

  /**
   * Evaluate a string in the default iframe.
   *
   * @param source - The source string to evaluate.
   * @returns The result of the evaluation, or an error message.
   */
  async function evaluate(source: string): Promise<string> {
    return `Error: evaluate not yet implemented`;
    /*
    try {
      const result = await iframeManager.sendMessage(IFRAME_ID, {
        type: Command.Evaluate,
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
