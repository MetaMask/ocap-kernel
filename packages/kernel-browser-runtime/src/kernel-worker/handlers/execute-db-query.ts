import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { array, object, record, string } from '@metamask/superstruct';

export const executeDBQuerySpec: MethodSpec<
  'executeDBQuery',
  { sql: string },
  Promise<Record<string, string>[]>
> = {
  method: 'executeDBQuery',
  params: object({
    sql: string(),
  }),
  result: array(record(string(), string())),
} as const;

export type ExecuteDBQueryHooks = {
  executeDBQuery: (sql: string) => Record<string, string>[];
};

export const executeDBQueryHandler: Handler<
  'executeDBQuery',
  { sql: string },
  Promise<Record<string, string>[]>,
  ExecuteDBQueryHooks
> = {
  ...executeDBQuerySpec,
  hooks: { executeDBQuery: true },
  implementation: async (
    { executeDBQuery }: ExecuteDBQueryHooks,
    params: { sql: string },
  ): Promise<Record<string, string>[]> => {
    return executeDBQuery(params.sql);
  },
};
