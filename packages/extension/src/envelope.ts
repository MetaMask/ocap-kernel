import { isObject } from '@metamask/utils';

import type { CapTpMessage, WrappedIframeMessage } from './message.js';
import { isCapTpMessage, isWrappedIframeMessage } from './message.js';

export enum EnvelopeLabel {
  Command = 'command',
  CapTp = 'capTp',
}

type EnvelopeForm<Label extends EnvelopeLabel, Content> = {
  label: Label;
  content: Content;
};

type LabelOf<Env> = Env extends EnvelopeForm<infer Label, unknown>
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

type ContentOf<Env> = Env extends EnvelopeForm<EnvelopeLabel, infer Content>
  ? Content
  : never;
type ContainerOf<Content> = {
  content: Content;
  [key: string]: unknown;
};

type GenericEnvelope<Env> = EnvelopeForm<LabelOf<Env>, ContentOf<Env>>;

type EnvelopeKit<Env extends GenericEnvelope<Env>> = {
  label: Env['label'];
  sniff: (value: unknown) => value is LabeledWith<Env['label']>;
  check: (value: unknown) => value is Env;
  wrap: (content: Env['content']) => Env;
  unwrap: (envelope: Env) => Env['content'];
};

const makeEnvelopeKit = <Env extends GenericEnvelope<Env>>(
  label: Env['label'],
  isContent: (value: unknown) => value is Env['content'],
): EnvelopeKit<Env> => {
  const hasLabel = (value: unknown): value is LabeledWith<Env['label']> =>
    isLabeled(value, label);
  const hasContent = (value: unknown): value is ContainerOf<ContentOf<Env>> =>
    isObject(value) &&
    typeof value.content !== 'undefined' &&
    isContent(value.content);
  return {
    label,
    sniff: hasLabel,
    check: (value: unknown): value is Env =>
      hasLabel(value) && hasContent(value),
    wrap: (content: ContentOf<Env>) =>
      ({
        label,
        content,
      } as Env),
    unwrap: (envelope: Env): Env['content'] => {
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

type CommandEnvelope = EnvelopeForm<
  EnvelopeLabel.Command,
  WrappedIframeMessage
>;
type CapTpEnvelope = EnvelopeForm<EnvelopeLabel.CapTp, CapTpMessage>;

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

type StreamEnvelopeContent<Label extends LabelOf<StreamEnvelope>> =
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
 * Sniffs envelope labels, applying the label's handler if known,
 * and applying the error handler if the label is not handled or
 * if the content did not meet the envelope's type guard.
 */
type StreamEnvelopeHandler = (envelope: StreamEnvelope) => Promise<unknown>;

/**
 * A handler for a specific stream envelope label.
 * The stream envelope handler will return the returned value if applied to a
 * well-formed envelope with the corresponding label.
 */
type ContentHandler<Label extends LabelOf<StreamEnvelope>> = (
  content: StreamEnvelopeContent<Label>,
) => Promise<unknown>;

/**
 * An object with {@link EnvelopeLabel} keys mapping to an appropriate {@link ContentHandler}.
 * If the stream envelope handler encounters a well-formed stream envelope without a defined handler,
 * the envelope will be passed to the {@link ErrorHandler}.
 */
type ContentHandlerBag = { [Label in EnvelopeLabel]?: ContentHandler<Label> };

/**
 * A handler for stream envelope parsing errors.
 * If the stream envelope handler encounters a parsing error, it will
 *  - throw the error handler's error if one is thrown
 *  - return the error handler's returned value otherwise
 */
type ErrorHandler = (reason: string) => unknown;

/**
 * Makes a {@link StreamEnvelopeHandler}.
 *
 * @param contentHandlers - A bag of async content handlers labeled with the envelope label they handle.
 * @param errorHandler - An optional synchronous error handler, required to throw.
 * @returns The stream envelope handler.
 */
export const makeStreamEnvelopeHandler =
  (
    contentHandlers: ContentHandlerBag,
    errorHandler: ErrorHandler = (reason) => {
      throw new Error(reason);
    },
  ): StreamEnvelopeHandler =>
  async (value: unknown) => {
    if (!isStreamEnvelope(value)) {
      return errorHandler(
        `Stream envelope handler received unexpected value ${JSON.stringify(
          value,
        )}`,
      );
    }
    const envelope = value;
    const kit = envelopeKits[envelope.label];
    /* v8 ignore next 5: Not known to be possible. */
    if (!kit) {
      return errorHandler(
        `Stream envelope handler received an envelope with unknown label "${envelope.label}"`,
      );
    }
    const handler = contentHandlers[envelope.label];
    if (!handler) {
      return errorHandler(
        `Stream envelope handler received an envelope with known but unexpected label "${envelope.label}"`,
      );
    }
    return await (handler as ContentHandler<typeof envelope.label>)(
      kit.unwrap(envelope),
    );
  };
