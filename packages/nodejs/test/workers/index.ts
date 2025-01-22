export const getTestWorkerFile = (name: string): string =>
  new URL(`./${name}.mjs`, import.meta.url).pathname;
