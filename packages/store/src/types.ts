export type KVStore = {
  get(key: string): string | undefined;
  getRequired(key: string): string;
  getNextKey(previousKey: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
};

export type VatStore = {
  getKVData(): Record<string, string>;
  updateKVData(sets: Record<string, string>, deletes: string[]): void;
};

export type KernelDatabase = {
  kernelKVStore: KVStore;
  executeQuery(sql: string): Record<string, string>[];
  clear(): void;
  makeVatStore(vatID: string): VatStore;
  deleteVatStore(vatID: string): void;
};
