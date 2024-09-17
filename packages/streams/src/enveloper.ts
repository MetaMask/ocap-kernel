// Enveloper.

import { isObject } from '@metamask/utils';

import type { ContainerOf, Envelope, LabeledWith } from './envelope.js';
import { isLabeled } from './envelope.js';
import type { Entries, TypeMap } from './utils/generics.js';

export type Enveloper<Label extends string, Content> = {
  label: Label;
  check: (value: unknown) => value is Envelope<Label, Content>;
  wrap: (content: Content) => Envelope<Label, Content>;
  unwrap: (envelope: Envelope<Label, Content>) => Content;
};

const makeEnveloper = <Label extends string, Content>(
  label: Label,
  isContent: (value: unknown) => value is Content,
): Enveloper<Label, Content> => {
  const hasLabel = (value: unknown): value is LabeledWith<Label> =>
    isLabeled(value, label);
  const hasContent = (value: unknown): value is ContainerOf<Content> =>
    isObject(value) &&
    typeof value.content !== 'undefined' &&
    isContent(value.content);
  return {
    label,
    check: (value: unknown): value is Envelope<Label, Content> =>
      hasLabel(value) && hasContent(value),
    wrap: (content: Content) =>
      ({
        label,
        content,
      } as Envelope<Label, Content>),
    unwrap: (envelope: Envelope<Label, Content>): Content => {
      if (!hasLabel(envelope)) {
        throw new Error(
          // @ts-expect-error The type of `envelope` is `never`, but this could happen at runtime.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Expected envelope labelled "${label}" but got "${envelope.label}".`,
        );
      }
      return envelope.content;
    },
  };
};

// Stream envelope kit.

export type StreamEnveloperGuards<
  Labels extends readonly string[],
  ContentMap extends TypeMap<Labels[number]>,
> = {
  [K in Labels[number]]: (value: unknown) => value is ContentMap[K];
};

export type StreamEnveloper<
  Labels extends readonly string[],
  ContentMap extends TypeMap<Labels[number]>,
> = {
  [K in Labels[number]]: Enveloper<K, ContentMap[K]>;
};

export const makeStreamEnveloper = <
  Labels extends readonly string[],
  ContentMap extends TypeMap<Labels[number]>,
>(
  guards: StreamEnveloperGuards<Labels, ContentMap>,
): StreamEnveloper<Labels, ContentMap> => {
  const entries = Object.entries(guards) as Entries<
    StreamEnveloperGuards<Labels, ContentMap>
  >;
  const streamEnveloper = Object.fromEntries(
    entries.map(([label, isContent]) => [
      label,
      makeEnveloper(label, isContent),
    ]),
  );
  return streamEnveloper as unknown as StreamEnveloper<Labels, ContentMap>;
};
