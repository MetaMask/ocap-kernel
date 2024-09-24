/**
 * This module provides a pair of classes for creating readable and writable streams
 * over a [MessagePort](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort).
 * The classes are naive passthrough mechanisms for data that assume exclusive access
 * to their ports. The lifetime of the underlying message port is expected to be
 * coextensive with "the other side".
 *
 * At the time of writing, there is no ergonomic way to detect the closure of a port. For
 * this reason, ports have to be ended manually via `.return()` or `.throw()`. Ending a
 * {@link MessagePortWriter} will end any {@link MessagePortReader} reading from the
 * remote port and close the entangled ports, but it will not affect any other streams
 * connected to the remote or local port, which must also be ended manually.
 *
 * Regarding limitations around detecting `MessagePort` closure, see:
 * - https://github.com/fergald/explainer-messageport-close
 * - https://github.com/whatwg/html/issues/10201
 *
 * @module MessagePort streams
 */

import { makeConnectionReader } from './connection-reader.js';
import { makeConnectionWriter } from './connection-writer.js';
import type { Connection } from './connection.js';
import type { Reader, Writer, ReaderMessage, WriterMessage } from './shared.js';
import type { StreamPair } from './stream-pair.js';
import { makeConnectionStreamPair } from './stream-pair.js';

export const makeMessagePortConnection = <Read, Write>(
  port: MessagePort,
): Connection<ReaderMessage<Read>, WriterMessage<Write>> => ({
  sendMessage: async (message: WriterMessage<Write>) =>
    port.postMessage(message),
  setMessageHandler: (handler: (message: ReaderMessage<Read>) => void) => {
    port.onmessage = handler;
  },
  close: async () => {
    port.close();
    port.onmessage = null;
  },
});

export const makeMessagePortReader = <Yield>(
  port: MessagePort,
): Reader<Yield> => makeConnectionReader(makeMessagePortConnection(port));

export const makeMessagePortWriter = <Yield>(
  port: MessagePort,
): Writer<Yield> => makeConnectionWriter(makeMessagePortConnection(port));

/**
 * Makes a reader / writer pair over the same port, and provides convenience methods
 * for cleaning them up.
 *
 * @param port - The message port to make the streams over.
 * @returns The reader and writer streams, and cleanup methods.
 */
export const makeMessagePortStreamPair = <Read, Write = Read>(
  port: MessagePort,
): StreamPair<Read, Write> => {
  const connection = makeMessagePortConnection<Read, Write>(port);
  return makeConnectionStreamPair(connection);
};
