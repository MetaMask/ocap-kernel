import { isObject } from '@metamask/utils';

import type { CapTpMessage, WrappedIframeMessage } from './message.js';
import { isCapTpMessage, isWrappedIframeMessage } from './message.js';

export enum EnvelopeLabel {
  Command = 'command',
  CapTp = 'capTp',
}

type EnvelopeLike<Label extends EnvelopeLabel, Content> = {
  label: Label;
  content: Content;
};

type LabelOf<Envelope> = Envelope extends EnvelopeLike<infer Label, unknown>
  ? Label
  : never;
type LabeledWith<Label extends EnvelopeLabel> = {
  label: Label;
  [key: string]: unknown;
};
const isLabeled = <Label extends EnvelopeLabel>(
  value: unknown,
  label?: Label,
): value is LabeledWith<Label> =>
  isObject(value) &&
  typeof value.label !== 'undefined' &&
  (label === undefined || value.label === label);

type ContentOf<Envelope> = Envelope extends EnvelopeLike<
  EnvelopeLabel,
  infer Content
>
  ? Content
  : never;
type ContainerOf<Content> = {
  content: Content;
  [key: string]: unknown;
};

type GenericEnvelope<Envelope> = EnvelopeLike<
  LabelOf<Envelope>,
  ContentOf<Envelope>
>;

type EnvelopeKit<Envelope extends GenericEnvelope<Envelope>> = {
  label: Envelope['label'];
  sniff: (value: unknown) => value is LabeledWith<Envelope['label']>;
  check: (value: unknown) => value is Envelope;
  wrap: (content: Envelope['content']) => Envelope;
  unwrap: (envelope: Envelope) => Envelope['content'];
};

const makeEnvelopeKit = <Envelope extends GenericEnvelope<Envelope>>(
  label: Envelope['label'],
  isContent: (value: unknown) => value is Envelope['content'],
): EnvelopeKit<Envelope> => {
  const hasLabel = (value: unknown): value is LabeledWith<Envelope['label']> =>
    isLabeled(value, label);
  const hasContent = (
    value: unknown,
  ): value is ContainerOf<Envelope['content']> =>
    isObject(value) &&
    typeof value.content !== 'undefined' &&
    isContent(value.content);
  return {
    label,
    sniff: hasLabel,
    check: (value: unknown): value is Envelope =>
      hasLabel(value) && hasContent(value),
    wrap: (content: Envelope['content']) =>
      ({
        label,
        content,
      } as Envelope),
    unwrap: (envelope: Envelope): Envelope['content'] => {
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

type CommandEnvelope = EnvelopeLike<
  EnvelopeLabel.Command,
  WrappedIframeMessage
>;
type CapTpEnvelope = EnvelopeLike<EnvelopeLabel.CapTp, CapTpMessage>;

export const commandEnveloper = makeEnvelopeKit<CommandEnvelope>(
  EnvelopeLabel.Command,
  isWrappedIframeMessage,
);
export const capTpEnveloper = makeEnvelopeKit<CapTpEnvelope>(
  EnvelopeLabel.CapTp,
  isCapTpMessage,
);

export const streamEnveloper = {
  sniffCommand: commandEnveloper.sniff,
  checkCommand: commandEnveloper.check,
  wrapCommand: commandEnveloper.wrap,
  unwrapCommand: commandEnveloper.unwrap,

  sniffCapTp: capTpEnveloper.sniff,
  checkCapTp: capTpEnveloper.check,
  wrapCapTp: capTpEnveloper.wrap,
  unwrapCapTp: capTpEnveloper.unwrap,
};

export type StreamEnvelope = CommandEnvelope | CapTpEnvelope;

type StreamEnvelopeContent<Label extends StreamEnvelope['label']> =
  Label extends EnvelopeLabel.Command
    ? CommandEnvelope['content']
    : Label extends EnvelopeLabel.CapTp
    ? CapTpEnvelope['content']
    : never;

const envelopeKits: { [Label in EnvelopeLabel]: EnvelopeKit<StreamEnvelope> } =
  Object.fromEntries([
    [EnvelopeLabel.Command, commandEnveloper],
    [EnvelopeLabel.CapTp, capTpEnveloper],
  ]);

export const isStreamEnvelope = (value: unknown): value is StreamEnvelope =>
  isLabeled(value) &&
  Object.values(envelopeKits).some((kit) => kit.check(value));

/**
 * A handler for automatically unwrapping stream envelopes and handling their content.
 *
 * @property handle - Sniffs an unknown value for envelope labels, applying the label's handler if known, and applying the error handler if the label is not handled or if the content did not pass the envelope's type guard.
 * @property contentHandlers - The bag of content candlers passed to the maker.
 * @property errorHandler - The error handler passed to the maker.
 */
export type StreamEnvelopeHandler = {
  handle: (envelope: StreamEnvelope) => Promise<unknown>;
  contentHandlers: StreamEnvelopeContentHandlerBag;
  errorHandler: StreamEnvelopeErrorHandler;
};

/**
 * A handler for a specific stream envelope label.
 */
type StreamEnvelopeContentHandler<Label extends EnvelopeLabel> = (
  content: StreamEnvelopeContent<Label>,
) => Promise<unknown>;

/**
 * An object with {@link EnvelopeLabel} keys mapping to an appropriate {@link StreamEnvelopeContentHandler}.
 * If the stream envelope handler encounters a well-formed stream envelope without a defined handler,
 * the envelope will be passed to the {@link ErrorHandler}.
 */
type StreamEnvelopeContentHandlerBag = {
  [Label in EnvelopeLabel]?: StreamEnvelopeContentHandler<Label>;
};

/**
 * A handler for stream envelope parsing errors.
 * If the {@link StreamEnvelopeHandler} encounters an error while parsing the supplied value,
 * it will pass the reason and value to the error handler.
 */
type StreamEnvelopeErrorHandler = (reason: string, value: unknown) => unknown;

/**
 * The default handler for stream envelope parsing errors.
 *
 * @param reason - The reason for the error.
 * @param value - The value that caused the error.
 */
const defaultStreamEnvelopeErrorHandler: StreamEnvelopeErrorHandler = (
  reason,
  value,
) => {
  throw new Error(`${reason} ${JSON.stringify(value, null, 2)}`);
};

/**
 * Makes a {@link StreamEnvelopeHandler} which handles an unknown value.
 *
 * If the supplied value is a valid envelope with a defined {@link StreamEnvelopeHandler},
 * the stream envelope handler will return whatever the defined handler returns.
 *
 * If the stream envelope handler is passed a well-formed stream envelope without a defined handler,
 * an explanation and the envelope will be passed to the supplied {@link StreamEnvelopeErrorHandler}.
 *
 * If the stream envelope handler encounters an error while parsing the supplied value,
 * it will pass the reason and value to the supplied {@link StreamEnvelopeErrorHandler}.
 *
 * If no error handler is supplied, the default error handling behavior is to throw.
 *
 * @param contentHandlers - A bag of async content handlers labeled with the {@link EnvelopeLabel} they handle.
 * @param errorHandler - An optional synchronous error handler.
 * @returns The stream envelope handler.
 */
export const makeStreamEnvelopeHandler = (
  contentHandlers: StreamEnvelopeContentHandlerBag,
  errorHandler: StreamEnvelopeErrorHandler = defaultStreamEnvelopeErrorHandler,
): StreamEnvelopeHandler => ({
  handle: async (value: unknown) => {
    if (!isStreamEnvelope(value)) {
      return errorHandler(
        'Stream envelope handler received unexpected value',
        value,
      );
    }
    const envelope = value;
    const kit = envelopeKits[envelope.label];
    /* v8 ignore next 6: Not known to be possible. */
    if (!kit) {
      return errorHandler(
        'Stream envelope handler received an envelope with unknown label',
        envelope,
      );
    }
    const handler = contentHandlers[envelope.label];
    if (!handler) {
      return errorHandler(
        'Stream envelope handler received an envelope with known but unexpected label',
        envelope,
      );
    }
    return await (
      handler as StreamEnvelopeContentHandler<typeof envelope.label>
    )(kit.unwrap(envelope));
  },
  contentHandlers,
  errorHandler,
});
