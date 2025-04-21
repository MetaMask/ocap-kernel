export type KVStore = {
  get(key: string): string | undefined;
  getRequired(key: string): string;
  getNextKey(previousKey: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
};

export type VatCheckpoint = [[string, string][], string[]];

export type VatKVStore = KVStore & {
  checkpoint(): VatCheckpoint;
};

export type VatStore = {
  getKVData(): [string, string][];
  updateKVData(sets: [string, string][], deletes: string[]): void;
};

export type KernelDatabase = {
  kernelKVStore: KVStore;
  executeQuery(sql: string): Record<string, string>[];
  clear(): void;
  makeVatStore(vatID: string): VatStore;
  deleteVatStore(vatID: string): void;
};
