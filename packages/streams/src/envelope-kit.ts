import type {
  StreamEnvelopeContentHandlerBag,
  StreamEnvelopeErrorHandler,
  StreamEnvelopeHandler,
} from './envelope-handler.js';
import { makeStreamEnvelopeHandler as makeHandler } from './envelope-handler.js';
import type { StreamEnvelope } from './envelope.js';
import { isLabeled } from './envelope.js';
import type {
  Enveloper,
  StreamEnveloper,
  StreamEnveloperGuards,
} from './enveloper.js';
import { makeStreamEnveloper } from './enveloper.js';
import type { TypeMap } from './utils/generics.js';

export type MakeStreamEnvelopeHandler<
  Labels extends readonly string[],
  ContentMap extends TypeMap<Labels[number]>,
> = (
  contentHandlers: StreamEnvelopeContentHandlerBag<Labels, ContentMap>,
  errorHandler?: StreamEnvelopeErrorHandler,
) => StreamEnvelopeHandler<Labels, ContentMap>;

export type StreamEnvelopeKit<
  Labels extends readonly string[],
  ContentMap extends TypeMap<Labels[number]>,
> = {
  streamEnveloper: StreamEnveloper<Labels, ContentMap>;
  isStreamEnvelope: (
    value: unknown,
  ) => value is StreamEnvelope<Labels[number], ContentMap>;
  makeStreamEnvelopeHandler: MakeStreamEnvelopeHandler<Labels, ContentMap>;
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
  guards: StreamEnveloperGuards<Labels, ContentMap>,
): StreamEnvelopeKit<Labels, ContentMap> => {
  const streamEnveloper = makeStreamEnveloper(guards);
  const isStreamEnvelope = (
    value: unknown,
  ): value is StreamEnvelope<Labels[number], ContentMap> =>
    isLabeled(value) &&
    (
      Object.values(streamEnveloper) as Enveloper<Labels[number], unknown>[]
    ).some((enveloper) => enveloper.check(value));

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
  const makeStreamEnvelopeHandler = (
    contentHandlers: StreamEnvelopeContentHandlerBag<Labels, ContentMap>,
    errorHandler?: StreamEnvelopeErrorHandler,
  ): StreamEnvelopeHandler<Labels, ContentMap> =>
    makeHandler(
      streamEnveloper,
      isStreamEnvelope,
      contentHandlers,
      errorHandler,
    );

  return {
    streamEnveloper,
    isStreamEnvelope,
    makeStreamEnvelopeHandler,
  };
};
