import { isObject } from '@metamask/utils';

import { makeStreamEnvelopeKit } from './envelope-kit.js';

export type Foo = {
  a: number;
  b: string;
};
export type Bar = {
  c: boolean;
};
export type ContentMap = {
  foo: Foo;
  bar: Bar;
};
export enum Label {
  Foo = 'foo',
  Bar = 'bar',
}

export const labels = Object.values(Label);

export const { streamEnveloper, isStreamEnvelope, makeStreamEnvelopeHandler } =
  makeStreamEnvelopeKit<typeof labels, ContentMap>({
    foo: (value: unknown): value is Foo =>
      isObject(value) &&
      typeof value.a === 'number' &&
      typeof value.b === 'string',
    bar: (value: unknown): value is Bar =>
      isObject(value) && typeof value.c === 'boolean',
  });

export const fooContent: Foo = { a: 0, b: 's' };
export const barContent: Bar = { c: false };

/* v8 ignore next 3: These are type assertions used in other tests. */
export const inferNumber = (value: number): number => value;
export const inferString = (value: string): string => value;
export const inferBoolean = (value: boolean): boolean => value;
