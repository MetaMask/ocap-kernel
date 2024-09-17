import type { StreamEnvelope } from './envelope.js';
import type { StreamEnveloper } from './enveloper.js';
import type { TypeMap } from './utils/generics.js';

/**
 * A handler for automatically unwrapping stream envelopes and handling their content.
 */
export type StreamEnvelopeHandler<
  Labels extends readonly string[],
  ContentMap extends TypeMap<Labels[number]>,
> = {
  /**
   * Checks an unknown value for envelope labels, applying the label's handler
   * if known, and applying the error handler if the label is not handled or if
   * the content did not pass the envelope's type guard.
   *
   * @template Envelope - The type of the envelope.
   * @param envelope - The envelope to handle.
   * @returns The result of the handler.
   */
  handle: <Envelope extends StreamEnvelope<Labels[number], ContentMap>>(
    envelope: Envelope,
  ) => Promise<unknown>;
  /**
   * The bag of async content handlers labeled with the {@link EnvelopeLabel} they handle.
   */
  contentHandlers: StreamEnvelopeContentHandlerBag<Labels, ContentMap>;
  /**
   * The error handler for the stream envelope handler.
   */
  errorHandler: StreamEnvelopeErrorHandler;
};

/**
 * A handler for a specific stream envelope label.
 */
type StreamEnvelopeContentHandler<
  EnvelopeLabel extends string,
  ContentMap extends TypeMap<EnvelopeLabel>,
  Label extends EnvelopeLabel,
> = (content: ContentMap[Label]) => Promise<unknown>;

/**
 * An object with {@link EnvelopeLabel} keys mapping to an appropriate {@link StreamEnvelopeContentHandler}.
 * If the stream envelope handler encounters a well-formed stream envelope without a defined handler,
 * the envelope will be passed to the {@link ErrorHandler}.
 */
export type StreamEnvelopeContentHandlerBag<
  Labels extends readonly string[],
  ContentMap extends TypeMap<Labels[number]>,
> = {
  [Label in Labels[number]]?: (content: ContentMap[Label]) => Promise<unknown>;
};

/**
 * A handler for stream envelope parsing errors.
 * If the {@link StreamEnvelopeHandler} encounters an error while parsing the supplied value,
 * it will pass the reason and value to the error handler.
 */
export type StreamEnvelopeErrorHandler = (
  reason: string,
  value: unknown,
) => unknown;

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
 * @param streamEnveloper - A {@link StreamEnveloper} made with the same Labels.
 * @param isStreamEnvelope - A type guard which identifies stream envelopes.
 * @param contentHandlers - A bag of async content handlers labeled with the {@link EnvelopeLabel} they handle.
 * @param errorHandler - An optional synchronous error handler.
 * @returns The stream envelope handler.
 */
export const makeStreamEnvelopeHandler = <
  Labels extends readonly string[],
  ContentMap extends TypeMap<Labels[number]>,
>(
  streamEnveloper: StreamEnveloper<Labels, ContentMap>,
  isStreamEnvelope: (
    value: unknown,
  ) => value is StreamEnvelope<Labels[number], ContentMap>,
  contentHandlers: StreamEnvelopeContentHandlerBag<Labels, ContentMap>,
  errorHandler: StreamEnvelopeErrorHandler = defaultStreamEnvelopeErrorHandler,
): StreamEnvelopeHandler<Labels, ContentMap> => {
  return {
    handle: async (value: unknown) => {
      if (!isStreamEnvelope(value)) {
        return errorHandler(
          'Stream envelope handler received unexpected value',
          value,
        );
      }
      const envelope = value;
      const handler = contentHandlers[envelope.label] as
        | StreamEnvelopeContentHandler<
            Labels[number],
            ContentMap,
            typeof envelope.label
          >
        | undefined;
      const enveloper = streamEnveloper[envelope.label];
      if (!handler || !enveloper) {
        console.debug(`handler: ${JSON.stringify(handler)}`);
        console.debug(`enveloper: ${JSON.stringify(enveloper)}`);
        return errorHandler(
          'Stream envelope handler received an envelope with known but unexpected label',
          envelope,
        );
      }
      const content = enveloper.unwrap(envelope);
      return await handler(content);
    },
    contentHandlers,
    errorHandler,
  };
};
