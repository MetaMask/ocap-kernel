import { makeStreamEnvelopeKit } from '@ocap/streams';

import type { CapTpMessage, WrappedIframeMessage } from './message.js';
import { isCapTpMessage, isWrappedIframeMessage } from './message.js';

// Utilitous mapped types.

type GuardType<TypeGuard> = TypeGuard extends (
  value: unknown,
) => value is infer Type
  ? Type
  : never;

// Declare and destructure the envelope kit.

enum EnvelopeLabel {
  Command = 'command',
  CapTp = 'capTp',
}

type ContentMap = {
  command: WrappedIframeMessage;
  capTp: CapTpMessage;
};

// makeStreamEnvelopeKit requires an enum of labels but typescript
// doesn't support enums as bounds on template parameters.
//
// See https://github.com/microsoft/TypeScript/issues/30611
//
// This workaround makes something equivalently type inferenceable.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const envelopeLabels = Object.values(EnvelopeLabel);

const { streamEnveloper, isStreamEnvelope } = makeStreamEnvelopeKit<
  typeof envelopeLabels,
  ContentMap
>({
  command: isWrappedIframeMessage,
  capTp: isCapTpMessage,
});

export const wrapCommand = streamEnveloper.command.wrap;
export const wrapCapTp = streamEnveloper.capTp.wrap;

// Stream envelope handler.

export type StreamEnvelope = GuardType<typeof isStreamEnvelope>;

/**
 * A handler for automatically unwrapping stream envelopes and handling their content.
 */
export type StreamEnvelopeHandler = {
  /**
   * Sniffs an unknown value for envelope labels, applying the label's handler
   * if known, and applying the error handler if the label is not handled or if
   * the content did not pass the envelope's type guard.
   *
   * @template Envelope - The type of the envelope.
   * @param envelope - The envelope to handle.
   * @returns The result of the handler.
   */
  handle: <Envelope extends StreamEnvelope>(
    envelope: Envelope,
  ) => Promise<unknown>;
  /**
   * The bag of async content handlers labeled with the {@link EnvelopeLabel} they handle.
   */
  contentHandlers: StreamEnvelopeContentHandlerBag;
  /**
   * The error handler for the stream envelope handler.
   */
  errorHandler: StreamEnvelopeErrorHandler;
};

/**
 * A handler for a specific stream envelope label.
 */
type StreamEnvelopeContentHandler<Label extends EnvelopeLabel> = (
  content: ContentMap[Label],
) => Promise<unknown>;

/**
 * An object with {@link EnvelopeLabel} keys mapping to an appropriate {@link StreamEnvelopeContentHandler}.
 * If the stream envelope handler encounters a well-formed stream envelope without a defined handler,
 * the envelope will be passed to the {@link ErrorHandler}.
 */
type StreamEnvelopeContentHandlerBag = {
  [Label in EnvelopeLabel]?: (content: ContentMap[Label]) => Promise<unknown>;
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
    const handler = contentHandlers[envelope.label] as
      | StreamEnvelopeContentHandler<typeof envelope.label>
      | undefined;
    if (!handler) {
      return errorHandler(
        'Stream envelope handler received an envelope with known but unexpected label',
        envelope,
      );
    }
    const enveloper = streamEnveloper[envelope.label];
    // The handler design makes typescript claustrophobic, but this is safe.
    const content = enveloper.unwrap(envelope as never);
    return await handler(content);
  },
  contentHandlers,
  errorHandler,
});
