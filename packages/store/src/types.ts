export type KVStore = {
  get(key: string): string | undefined;
  getRequired(key: string): string;
  getNextKey(previousKey: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  clear(): void;
  executeQuery(sql: string): Record<string, string>[];
};

export type MakeKVStore = (
  dbFilename?: string,
  label?: string,
  verbose?: boolean,
) => Promise<KVStore>;
