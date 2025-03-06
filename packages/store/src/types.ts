export type KVStore = {
  get(key: string): string | undefined;
  getRequired(key: string): string;
  getNextKey(previousKey: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
};

export type VatStore = {
  getKVData(): Map<string, string>;
  updateKVData(sets: Map<string, string>, deletes: Set<string>): void;
};

export type KernelDatabase = {
  kernelKVStore: KVStore;
  executeQuery(sql: string): Record<string, string>[];
  clear(): void;
  makeVatStore(vatID: string): VatStore;
};
