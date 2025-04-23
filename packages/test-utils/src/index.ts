export { delay } from './delay.ts';
export { flaky } from './flaky.ts';
export { makeErrorMatcherFactory } from './errors.ts';
export { makePromiseKitMock } from './promise-kit.ts';
export { fetchMock } from './env/fetch-mock.ts';
export * from './env/mock-kernel.ts';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Intermittent browser/Node incompatibility
if (typeof self === 'undefined') {
  // @ts-expect-error Consistent browser/Node incompatibility
  globalThis.self = globalThis;
}
