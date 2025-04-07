import { array, object, record, string } from '@metamask/superstruct';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';

const executeDBQuerySpec: MethodSpec<
  'executeDBQuery',
  { sql: string },
  Record<string, string>[]
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
  Record<string, string>[],
  ExecuteDBQueryHooks
> = {
  ...executeDBQuerySpec,
  hooks: { executeDBQuery: true },
  implementation: (
    { executeDBQuery }: ExecuteDBQueryHooks,
    params: { sql: string },
  ): Record<string, string>[] => {
    return executeDBQuery(params.sql);
  },
};
