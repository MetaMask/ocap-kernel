import type { PromiseKit } from '@endo/promise-kit';

export type VatId = `v${number}`;

export const isVatId = (value: unknown): value is VatId =>
  typeof value === 'string' &&
  value.at(0) === 'v' &&
  value.slice(1) === String(Number(value.slice(1)));

export type PromiseCallbacks<Resolve = unknown> = Omit<
  PromiseKit<Resolve>,
  'promise'
>;
