export { delay } from './delay.ts';
export { makeErrorMatcherFactory } from './errors.ts';
export { makePromiseKitMock } from './promise-kit.ts';
export { fetchMock } from './env/fetch-mock.ts';
export * from './env/mock-kernel.ts';

if (typeof self === 'undefined') {
  // @ts-expect-error error concerns the browser but this will only run in Node
  globalThis.self = globalThis;
}
