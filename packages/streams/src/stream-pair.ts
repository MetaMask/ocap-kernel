import { hasProperty, isObject } from '@metamask/utils';

import { makeConnectionReader } from './connection-reader.js';
import { makeConnectionWriter } from './connection-writer.js';
import type { Connection } from './connection.js';
import type { Reader, Writer, ReaderMessage, WriterMessage } from './shared.js';

export type StreamPair<Read, Write = Read> = Readonly<{
  reader: Reader<Read>;
  writer: Writer<Write>;
  /**
   * Calls `.return()` on both streams.
   */
  return: () => Promise<void>;
  /**
   * Calls `.throw()` on the writer, forwarding the error to the other side. Returns
   * the reader.
   *
   * @param error - The error to forward.
   */
  throw: (error: Error) => Promise<void>;
}>;

export const isStreamPair = <Read, Write = Read>(
  value: unknown,
): value is StreamPair<Read, Write> =>
  isObject(value) &&
  hasProperty(value, 'reader') &&
  hasProperty(value, 'writer') &&
  hasProperty(value, 'return') &&
  hasProperty(value, 'throw');

/**
 * Makes a reader / writer pair over the same connection, and provides convenience methods
 * for cleaning them up.
 *
 * @param connection - The connection to make the streams over.
 * @returns The reader and writer streams, and cleanup methods.
 */
export const makeConnectionStreamPair = <Read, Write>(
  connection: Connection<ReaderMessage<Read>, WriterMessage<Write>>,
): StreamPair<Read, Write> => {
  const reader = makeConnectionReader(connection);
  const writer = makeConnectionWriter(connection);

  return harden({
    reader,
    writer,
    return: async () =>
      Promise.all([writer.return(), reader.return()])
        .then()
        .then(connection.close),
    throw: async (error: Error) =>
      Promise.all([writer.throw(error), reader.return()])
        .then()
        .then(connection.close),
  });
};
