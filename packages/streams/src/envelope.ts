// Envelope types and type guards.

import { isObject } from '@metamask/utils';

import type { TypeMap } from './utils/generics.js';

export type Envelope<Label extends string, Content> = {
  label: Label;
  content: Content;
};

export type LabeledWith<Label extends string> = {
  label: Label;
  [key: string]: unknown;
};

export const isLabeled = <Label extends string>(
  value: unknown,
  label?: Label,
): value is LabeledWith<Label> =>
  isObject(value) &&
  typeof value.label !== 'undefined' &&
  (label === undefined || value.label === label);

export type ContainerOf<Content> = {
  content: Content;
  [key: string]: unknown;
};

export type StreamEnvelope<
  Label extends string,
  ContentMap extends TypeMap<Label>,
> = {
  [K in Label]: Envelope<K, ContentMap[K]>;
}[Label];
