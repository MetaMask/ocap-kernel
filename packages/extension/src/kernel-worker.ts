import './kernel-worker-trusted-prelude.js';
import type { KernelCommand, KernelCommandReply, VatId } from '@ocap/kernel';
import { isKernelCommand, Kernel, KernelCommandMethod } from '@ocap/kernel';
import { PostMessageDuplexStream, receiveMessagePort } from '@ocap/streams';
import { makeLogger, stringify } from '@ocap/utils';
import type { Database } from '@sqlite.org/sqlite-wasm';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

import { ExtensionVatWorkerClient } from './VatWorkerClient.js';

type MainArgs = { defaultVatId: VatId };

const logger = makeLogger('[kernel worker]');

main({ defaultVatId: 'v0' }).catch(console.error);

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
 *
 * @param options - The options bag.
 * @param options.defaultVatId - The id to give the default vat.
 */
async function main({ defaultVatId }: MainArgs): Promise<void> {
  // Note we must setup the worker MessageChannel before initializing the stream,
  // because the stream will close if it receives an unrecognized message.
  const clientPort = await receiveMessagePort(
    (listener) => globalThis.addEventListener('message', listener),
    (listener) => globalThis.removeEventListener('message', listener),
  );

  const vatWorkerClient = new ExtensionVatWorkerClient(
    (message) => clientPort.postMessage(message),
    (listener) => {
      clientPort.onmessage = listener;
    },
  );

  const startTime = performance.now();

  const kernelStream = new PostMessageDuplexStream<
    KernelCommand,
    KernelCommandReply
  >(
    (message) => globalThis.postMessage(message),
    (listener) => globalThis.addEventListener('message', listener),
    (listener) => globalThis.removeEventListener('message', listener),
  );

  // Initialize kernel store.

  const { sqlKVGet, sqlKVSet } = await initDb();

  // Create kernel.

  const kernel = new Kernel(vatWorkerClient);
  const vatReadyP = kernel.launchVat({ id: defaultVatId });

  await reply({
    method: KernelCommandMethod.InitKernel,
    params: {
      defaultVat: defaultVatId,
      initTime: performance.now() - startTime,
    },
  });

  // Handle messages from the console service worker
  await kernelStream.drain(handleKernelCommand);

  /**
   * Handle a KernelCommand sent from the offscreen.
   *
   * @param command - The KernelCommand to handle.
   */
  async function handleKernelCommand(command: KernelCommand): Promise<void> {
    if (!isKernelCommand(command)) {
      logger.error('Received unexpected message', command);
      return;
    }

    const { method, params } = command;

    switch (method) {
      case KernelCommandMethod.InitKernel:
        throw new Error('The kernel starts itself.');
      case KernelCommandMethod.Ping:
        await reply({ method, params: 'pong' });
        break;
      case KernelCommandMethod.Evaluate:
        await handleVatTestCommand({ method, params });
        break;
      case KernelCommandMethod.CapTpCall:
        await handleVatTestCommand({ method, params });
        break;
      case KernelCommandMethod.KVSet:
        kvSet(params.key, params.value);
        await reply({
          method,
          params: `~~~ set "${params.key}" to "${params.value}" ~~~`,
        });
        break;
      case KernelCommandMethod.KVGet: {
        try {
          const result = kvGet(params);
          await reply({
            method,
            params: result,
          });
        } catch (problem) {
          // TODO: marshal
          await reply({
            method,
            params: String(asError(problem)),
          });
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
  }

  /**
   * Handle a command implemented by the test vat.
   *
   * @param command - The command to handle.
   */
  async function handleVatTestCommand(
    command: Extract<
      KernelCommand,
      | { method: typeof KernelCommandMethod.Evaluate }
      | { method: typeof KernelCommandMethod.CapTpCall }
    >,
  ): Promise<void> {
    const { method, params } = command;
    const vat = await vatReadyP;
    switch (method) {
      case KernelCommandMethod.Evaluate:
        await reply({
          method,
          params: await evaluate(vat.id, params),
        });
        break;
      case KernelCommandMethod.CapTpCall:
        await reply({
          method,
          params: stringify(await vat.callCapTp(params)),
        });
        break;
      default:
        console.error(
          'Offscreen received unexpected vat command',
          // @ts-expect-error Runtime does not respect "never".
          { method: method.valueOf(), params },
        );
    }
  }

  /**
   * Reply to the background script.
   *
   * @param payload - The payload to reply with.
   */
  async function reply(payload: KernelCommandReply): Promise<void> {
    await kernelStream.write(payload);
  }

  /**
   * Evaluate a string in the default iframe.
   *
   * @param vatId - The ID of the vat to send the message to.
   * @param source - The source string to evaluate.
   * @returns The result of the evaluation, or an error message.
   */
  async function evaluate(vatId: VatId, source: string): Promise<string> {
    try {
      const result = await kernel.sendMessage(vatId, {
        method: KernelCommandMethod.Evaluate,
        params: source,
      });
      return String(result);
    } catch (error) {
      if (error instanceof Error) {
        return `Error: ${error.message}`;
      }
      return `Error: Unknown error during evaluation.`;
    }
  }

  /**
   * Coerce an unknown problem into an Error object.
   *
   * @param problem - Whatever was caught.
   * @returns The problem if it is an Error, or a new Error with the problem as the cause.
   */
  function asError(problem: unknown): Error {
    return problem instanceof Error
      ? problem
      : new Error('Unknown', { cause: problem });
  }

  /**
   * Initialize the database and some prepared statements.
   *
   * @returns The prepared database statements.
   */
  async function initDb(): Promise<{
    sqlKVGet: ReturnType<typeof db.prepare>;
    sqlKVSet: ReturnType<typeof db.prepare>;
  }> {
    const db = await initDB();
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT,
        value TEXT,
        PRIMARY KEY(key)
      )
    `);

    return {
      sqlKVGet: db.prepare(`
      SELECT value
      FROM kv
      WHERE key = ?
    `),
      sqlKVSet: db.prepare(`
      INSERT INTO kv (key, value)
      VALUES (?, ?)
      ON CONFLICT DO UPDATE SET value = excluded.value
    `),
    };
  }

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
}
