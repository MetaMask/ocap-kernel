export const getTestWorkerFile = (name: string): string =>
  new URL(`./${name}.js`, import.meta.url).pathname;
