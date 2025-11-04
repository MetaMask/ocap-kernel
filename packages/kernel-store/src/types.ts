export type KVStore = {
  get(key: string): string | undefined;
  getRequired(key: string): string;
  getNextKey(previousKey: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
};

export type KVPair = [string, string];

/**
 * A vat checkpoint is a tuple of two arrays describing the changes since the previous checkpoint:
 * - The first array contains updated key-value pairs.
 * - The second array contains deleted keys.
 */
export type VatCheckpoint = [KVPair[], string[]];

export type VatKVStore = KVStore & {
  checkpoint(): VatCheckpoint;
};

export type VatStore = {
  getKVData(): KVPair[];
  updateKVData(sets: KVPair[], deletes: string[]): void;
};

export type KernelDatabase = {
  kernelKVStore: KVStore;
  executeQuery(sql: string): Record<string, string>[];
  clear(): void;
  makeVatStore(vatID: string): VatStore;
  deleteVatStore(vatID: string): void;
  createSavepoint(name: string): void;
  rollbackSavepoint(name: string): void;
  releaseSavepoint(name: string): void;
  close(): void;
};
