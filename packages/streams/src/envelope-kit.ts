import { isObject } from '@metamask/utils';

// Utilitous mapped types.

/**
 * An object type mapping keys to `ValueType`.
 * A type which extends `TypeMap<SpecificKeys, unknown>` can map each key to a different type.
 */
type TypeMap<Keys extends string, ValueType = unknown> = {
  [key in Keys]: ValueType;
};

/**
 * Omit from `ObjectType` all keys without the specified `ValueType`.
 */
type PickByValue<ObjectType, ValueType> = Pick<
  ObjectType,
  {
    [K in keyof ObjectType]: ObjectType[K] extends ValueType ? K : never;
  }[keyof ObjectType]
>;

/**
 * The result type of calling `Object.entries` on an object of type `ObjectType`.
 *
 * WARNING: If an object is typed as `ObjectType` but has excess properties,
 * `Entries<typeof object>` will incorrectly omit the entries corresponding to the
 * excess properties. Ensure your assumptions about the object align with typescript's.
 * To be safe, use a type guard or only apply to objects you have declared.
 *
 * See https://www.typescriptlang.org/docs/handbook/2/objects.html#excess-property-checks
 * for a description of excess properties.
 */
type Entries<ObjectType> = {
  [K in keyof ObjectType]: [
    keyof PickByValue<ObjectType, ObjectType[K]>,
    ObjectType[K],
  ];
}[keyof ObjectType][];

// Envelope types and type guards.

type Envelope<Label extends string, Content> = {
  label: Label;
  content: Content;
};

type LabeledWith<Label extends string> = {
  label: Label;
  [key: string]: unknown;
};

const isLabeled = <Label extends string>(
  value: unknown,
  label?: Label,
): value is LabeledWith<Label> =>
  isObject(value) &&
  typeof value.label !== 'undefined' &&
  (label === undefined || value.label === label);

type ContainerOf<Content> = {
  content: Content;
  [key: string]: unknown;
};

// Enveloper.

type Enveloper<Label extends string, Content> = {
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

type StreamEnvelopeKitGuards<
  Labels extends readonly string[],
  ContentMap extends TypeMap<Labels[number]>,
> = {
  [K in Labels[number]]: (value: unknown) => value is ContentMap[K];
};

type StreamEnveloper<
  Labels extends readonly string[],
  ContentMap extends TypeMap<Labels[number]>,
> = {
  [K in Labels[number]]: Enveloper<K, ContentMap[K]>;
};

type StreamEnvelope<Label extends string, ContentMap extends TypeMap<Label>> = {
  [K in Label]: Envelope<K, ContentMap[K]>;
}[Label];

type StreamEnvelopeKit<
  Labels extends readonly string[],
  ContentMap extends TypeMap<Labels[number]>,
> = {
  streamEnveloper: StreamEnveloper<Labels, ContentMap>;
  isStreamEnvelope: (
    value: unknown,
  ) => value is StreamEnvelope<Labels[number], ContentMap>;
};

/**
 * Make a {@link StreamEnvelopeKit}.
 * The template parameters must be explicitly declared. See tutorial for suggested declaration pattern.
 *
 * @tutorial documents/make-stream-envelope-kit.md - An example showing how to specify the template parameters, including how to pass an enum type as a template parameter.
 * @template Labels - An enum of envelope labels. WARNING: if specified improperly, typescript inference fails. See referenced tutorial.
 * @template Content - An object type mapping the specified labels to the type of content they label.
 * @param guards - An object mapping the specified envelope labels to a type guard of their contents.
 * @returns The {@link StreamEnvelopeKit}.
 */
export const makeStreamEnvelopeKit = <
  Labels extends string[],
  ContentMap extends TypeMap<Labels[number]>,
>(
  guards: StreamEnvelopeKitGuards<Labels, ContentMap>,
): StreamEnvelopeKit<Labels, ContentMap> => {
  const entries = Object.entries(guards) as Entries<
    StreamEnvelopeKitGuards<Labels, ContentMap>
  >;
  const streamEnveloper = Object.fromEntries(
    entries.map(([label, isContent]) => [
      label,
      makeEnveloper(label, isContent),
    ]),
  );
  return {
    streamEnveloper: streamEnveloper as unknown as StreamEnveloper<
      Labels,
      ContentMap
    >,
    isStreamEnvelope: (
      value: unknown,
    ): value is StreamEnvelope<Labels[number], ContentMap> =>
      isLabeled(value) &&
      Object.values(streamEnveloper).some((enveloper) =>
        enveloper.check(value),
      ),
  };
};
