import { resolve } from "path";

export const documentRoot = resolve(
  new URL('content', import.meta.url).pathname
).replace(/\/dist\//u, '/src/');
