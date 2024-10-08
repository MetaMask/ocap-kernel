import './kernel-worker-trusted-prelude.js';
import { CommandMethod, isCommand } from '@ocap/kernel';
import type { CommandReply, CommandReplyFunction } from '@ocap/kernel';
import type { Database } from '@sqlite.org/sqlite-wasm';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

import type { KVStore, KernelStore } from './kernel-store.js';
import { makeKernelStore } from './kernel-store.js';

main().catch(console.error);

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

  const kv: KVStore = {
    get: kvGet,
    set: kvSet,
    delete: () => {
      throw Error('not yet implemented');
    },
  };
  const kfoo: KernelStore = makeKernelStore(kv);

  /**
   * Reply to the background script.
   *
   * @param method - The message method.
   * @param params - The message params.
   */
  const reply: CommandReplyFunction = (
    method: CommandMethod,
    params?: CommandReply['params'],
  ) => {
    postMessage({ method, params });
  };

  // Handle messages from the console service worker
  onmessage = async (event) => {
    if (!isCommand(event.data)) {
      console.log('received unexpected message', event.data);
    }
    const { method, params } = event.data;
    console.log('received message: ', method, params);

    switch (method) {
      case CommandMethod.Evaluate:
        reply(CommandMethod.Evaluate, await evaluate(params));
        break;
      case CommandMethod.CapTpCall: {
        reply(
          CommandMethod.CapTpCall,
          'Error: CapTpCall not implemented here (yet)',
        );
        break;
      }
      case CommandMethod.CapTpInit:
        reply(
          CommandMethod.CapTpInit,
          'Error: CapTpInit not implemented here (yet)',
        );
        break;
      case CommandMethod.Ping:
        reply(CommandMethod.Ping, 'pong');
        break;
      case CommandMethod.KVSet: {
        const { key, value } = params;
        kvSet(key, value);
        reply(CommandMethod.KVSet, `~~~ set "${key}" to "${value}" ~~~`);
        break;
      }
      case CommandMethod.KVGet: {
        try {
          const result = kvGet(params);
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
   * Evaluate a string in the default iframe.
   *
   * @param _source - The source string to evaluate.
   * @returns The result of the evaluation, or an error message.
   */
  async function evaluate(_source: string): Promise<string> {
    return `Error: evaluate not implemented here (yet)`;
  }
}
