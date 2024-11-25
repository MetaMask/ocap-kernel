export type Config = {
  server: {
    port: number;
  };
  dir?: string;
};

export const defaultConfig: Config = {
  server: {
    port: 3000,
  },
};
