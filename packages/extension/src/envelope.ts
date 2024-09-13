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

type ContentHandler<Label extends LabelOf<StreamEnvelope>> = (
  content: StreamEnvelopeContent<Label>,
) => Promise<unknown>;

type ErrorHandler = (...args: unknown[]) => never;

type ContentHandlerBag = { [Label in EnvelopeLabel]?: ContentHandler<Label> };

const defaultStreamEnvelopeErrorHandler = (problem: unknown): never => {
  throw new Error(String(problem));
};
export const makeStreamEnvelopeHandler =
  (
    contentHandlers: ContentHandlerBag,
    errorHandler: ErrorHandler = defaultStreamEnvelopeErrorHandler,
  ) =>
  async (value: unknown) => {
    const envelope = isStreamEnvelope(value)
      ? value
      : errorHandler(
          `Stream envelope handler received unexpected value ${JSON.stringify(
            value,
          )}`,
        );
    const kit =
      /* v8 ignore next 4: Not known to be possible. */
      envelopeKits[envelope.label] ??
      errorHandler(
        `Stream envelope handler received an envelope with unknown label "${envelope.label}"`,
      );
    const handler: ContentHandler<typeof envelope.label> =
      contentHandlers[envelope.label] ??
      errorHandler(
        `Stream envelope handler received an envelope with known but unexpected label "${envelope.label}"`,
      );
    return handler(kit.unwrap(envelope));
  };
