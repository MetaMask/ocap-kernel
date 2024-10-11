export type KernelStore = {
  kvGet: (key: string) => string;
  kvSet: (key: string, value: string) => void;
};
