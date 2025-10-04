import { Logger } from '@metamask/logger';

import { SQL_QUERIES } from './common.ts';
import type { KernelDatabase, KVPair } from '../types.ts';
import { makeWriteBehindKernelDatabase } from '../write-behind.ts';

// Minimal structural types for Cloudflare D1
export type D1PreparedStatement = Readonly<{
  bind: (...values: unknown[]) => D1PreparedStatement;
  run: () => Promise<{ success: boolean }>;
  all: () => Promise<{ results?: ReadonlyArray<Record<string, unknown>> }>;
}>;

export type D1Database = Readonly<{
  prepare: (query: string) => D1PreparedStatement;
}>;

async function ensureSchema(db: D1Database): Promise<void> {
  await db.prepare(SQL_QUERIES.CREATE_TABLE).run();
  await db.prepare(SQL_QUERIES.CREATE_TABLE_VS).run();
}

async function loadInitialKernelEntries(db: D1Database): Promise<KVPair[]> {
  const { results } = await db
    .prepare('SELECT key, value FROM kv')
    .all();
  const rows = results ?? [];
  return rows.map((r) => [String(r.key), String(r.value)] as KVPair);
}

async function loadInitialVatEntries(
  db: D1Database,
): Promise<ReadonlyArray<{ vatID: string; pairs: ReadonlyArray<KVPair> }>> {
  const { results } = await db
    .prepare('SELECT vatID, key, value FROM kv_vatstore')
    .all();
  const rows = results ?? [];

  const table = new Map<string, KVPair[]>();
  for (const r of rows) {
    const vatID = String(r.vatID);
    const key = String(r.key);
    const value = String(r.value);
    const list = table.get(vatID) ?? [];
    list.push([key, value]);
    if (!table.has(vatID)) {
      table.set(vatID, list);
    }
  }
  return Array.from(table.entries()).map(([vatID, pairs]) => ({ vatID, pairs }));
}

export async function makeD1KernelDatabase({
  db,
  logger,
}: {
  db: D1Database;
  logger?: Logger;
}): Promise<KernelDatabase> {
  const log = logger ?? new Logger('kernel-store-d1');
  await ensureSchema(db);

  // Load snapshot so sync reads reflect persisted state
  const [initialKernelEntries, initialVatEntries] = await Promise.all([
    loadInitialKernelEntries(db),
    loadInitialVatEntries(db),
  ]);

  const backend = {
    kernel: {
      clear: async (): Promise<void> => {
        await db.prepare(SQL_QUERIES.CLEAR).run();
        await db.prepare(SQL_QUERIES.CLEAR_VS).run();
      },
      set: async (key: string, value: string): Promise<void> => {
        await db.prepare(SQL_QUERIES.SET).bind(key, value).run();
      },
      delete: async (key: string): Promise<void> => {
        await db.prepare(SQL_QUERIES.DELETE).bind(key).run();
      },
    },
    vat: {
      set: async (vatID: string, key: string, value: string): Promise<void> => {
        await db.prepare(SQL_QUERIES.SET_VS).bind(vatID, key, value).run();
      },
      delete: async (vatID: string, key: string): Promise<void> => {
        await db.prepare(SQL_QUERIES.DELETE_VS).bind(vatID, key).run();
      },
      deleteAll: async (vatID: string): Promise<void> => {
        await db.prepare(SQL_QUERIES.DELETE_VS_ALL).bind(vatID).run();
      },
    },
  } as const;

  return await makeWriteBehindKernelDatabase({
    backend,
    logger: log,
    initialKernelEntries,
    initialVatEntries,
  });
}

harden(makeD1KernelDatabase);


