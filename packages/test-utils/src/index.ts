export { delay } from './delay.js';
export { makeErrorMatcherFactory } from './errors.js';
export { makePromiseKitMock } from './promise-kit.js';
export { fetchMock } from './env/fetch-mock.js';
export * from './env/mock-kernel.js';

if (typeof self === 'undefined') {
  // @ts-expect-error error concerns the browser but this will only run in Node
  globalThis.self = globalThis;
}
