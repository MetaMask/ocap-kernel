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

import { makePromiseKit } from '@endo/promise-kit';
import type { Reader as EndoReader, Writer as EndoWriter } from '@endo/stream';
import { hasProperty, isObject } from '@metamask/utils';

import { makeDoneKit, makeDoneResult } from './done-kit.js';

abstract class Reader<Yield> implements EndoReader<Yield> {
  abstract next(): Promise<IteratorResult<Yield>>;

  abstract return(): Promise<IteratorResult<Yield>>;

  abstract throw(error: Error): Promise<IteratorResult<Yield>>;

  abstract [Symbol.asyncIterator](): Reader<Yield>;
}

abstract class Writer<Yield> implements EndoWriter<Yield> {
  abstract next(value: Yield): Promise<IteratorResult<undefined>>;

  abstract return(): Promise<IteratorResult<undefined>>;

  abstract throw(error: Error): Promise<IteratorResult<undefined>>;

  abstract [Symbol.asyncIterator](): Writer<Yield>;
}

export type { Reader, Writer };

export const isStream = (
  value: unknown,
): value is Reader<unknown> | Writer<unknown> =>
  isObject(value) &&
  typeof value.next === 'function' &&
  typeof value.return === 'function' &&
  typeof value.throw === 'function';

export type ReaderMessage<Yield> = IteratorResult<Yield, undefined> & {
  data: any;
};

export type WriterMessage<Yield> = IteratorResult<Yield, undefined> | Error;

type PromiseCallbacks = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

const isIteratorResult = (
  value: unknown,
): value is IteratorResult<unknown, unknown> =>
  isObject(value) &&
  (!hasProperty(value, 'done') || typeof value.done === 'boolean') &&
  hasProperty(value, 'value');

export type Connection<Incoming, Outgoing> = {
  open: () => Promise<void>;
  sendMessage: (message: Outgoing) => Promise<void>;
  setMessageHandler: (handler: (message: Incoming) => void) => void;
  close: () => Promise<void>;
};

const makeMessagePortConnection = <Read, Write>(
  port: MessagePort,
): Connection<ReaderMessage<Read>, WriterMessage<Write>> => ({
  open: async () => {},
  sendMessage: async (message: any) => port.postMessage(message),
  setMessageHandler: (handler: (message: any) => void) => {
    port.onmessage = handler;
  },
  close: async () => {
    port.close();
    port.onmessage = null;
  },
});

/**
 * Make a readable stream over a {@link Connection}.
 *
 * This class is a naive passthrough mechanism for data over a connection.
 * Expects exclusive access to the connection.
 *
 * @param connection
 * @see
 * - {@link makeConnectionWriter} for the corresponding writable stream maker.
 * - The module-level documentation for more details.
 */
export const makeConnectionReader = <Yield>(
  connection: Connection<ReaderMessage<Yield>, any>,
): Reader<Yield> => {
  /**
   * For buffering messages to manage backpressure, i.e. the input rate exceeding the
   * read rate.
   */
  let messageQueue: ReaderMessage<Yield>[] = [];

  /**
   * For buffering reads to manage "suction", i.e. the read rate exceeding the input rate.
   */
  const readQueue: PromiseCallbacks[] = [];

  const { setDone, doIfNotDone, returnIfNotDone } = makeDoneKit(async () => {
    // free references held in queues
    messageQueue = [];
    await connection.close();
  });

  const doThrow = (error: Error): void => {
    while (readQueue.length > 0) {
      const { reject } = readQueue.shift() as PromiseCallbacks;
      reject(error);
    }
    setDone();
  };

  const doReturn = (): void => {
    while (readQueue.length > 0) {
      const { resolve } = readQueue.shift() as PromiseCallbacks;
      resolve(makeDoneResult());
    }
    setDone();
  };

  connection.setMessageHandler((message: ReaderMessage<Yield>): void => {
    if (message.data instanceof Error) {
      doThrow(message.data);
      return;
    }

    if (!isIteratorResult(message.data)) {
      doThrow(
        new Error(
          `Received unexpected message via message port:\n${JSON.stringify(
            message.data,
            null,
            2,
          )}`,
        ),
      );
      return;
    }

    if (message.data.done === true) {
      doReturn();
      return;
    }

    if (readQueue.length > 0) {
      const { resolve } = readQueue.shift() as PromiseCallbacks;
      resolve({ ...message.data });
    } else {
      messageQueue.push(message);
    }
  });

  const reader: Reader<Yield> = {
    [Symbol.asyncIterator]: () => reader,

    /**
     * Reads the next message from the connection.
     *
     * @returns The next message from the connection.
     */
    next: returnIfNotDone(async () => {
      const { promise, resolve, reject } = makePromiseKit();
      if (messageQueue.length > 0) {
        const message = messageQueue.shift() as ReaderMessage<Yield>;
        resolve({ ...message.data });
      } else {
        readQueue.push({ resolve, reject });
      }
      return promise as Promise<IteratorResult<Yield, undefined>>;
    }),

    /**
     * Closes the underlying port and returns. Any unread messages will be lost.
     *
     * @returns The final result for this stream.
     */
    return: doIfNotDone(doReturn),

    /**
     * Rejects all pending reads with the specified error, closes the underlying port,
     * and returns.
     *
     * @param error - The error to reject pending reads with.
     * @returns The final result for this stream.
     */
    throw: doIfNotDone(doThrow),
  };

  return harden(reader);
};

/**
 * Make a writable stream over a {@link MessagePort}.
 *
 * This class is a naive passthrough mechanism for data over a pair of linked message
 * ports. The message port mechanism is assumed to be completely reliable, and this
 * class therefore has no concept of errors or error handling. Errors and closure
 * are expected to be handled at a higher level of abstraction.
 *
 * @param connection
 * @see
 * - {@link makeMessagePortReader} for the corresponding readable stream maker.
 * - The module-level documentation for more details.
 */
export const makeConnectionWriter = <Yield>(
  connection: Connection<any, WriterMessage<Yield>>,
): Writer<Yield> => {
  const { setDone, doIfNotDone, callIfNotDone } = makeDoneKit(connection.close);

  /**
   * Sends the value over the port. If sending the value fails, calls `#throw()`, and is
   * therefore mutually recursive with this method. For this reason, includes a flag
   * indicating past failure to send a value, which is used to avoid infinite recursion.
   * If sending the value succeeds, returns a finished result (`{ done: true }`) if the
   * value was an {@link Error} or itself a finished result, otherwise returns an
   * unfinished result (`{ done: false }`).
   *
   * @param value - The value to send over the port.
   * @param hasFailed - Whether sending has failed previously.
   * @returns The result of sending the value.
   */
  const send = async (
    value: IteratorResult<Yield, undefined> | Error,
    hasFailed = false,
  ): Promise<IteratorResult<undefined, undefined>> => {
    try {
      await connection.sendMessage(value);
      return value instanceof Error || value.done === true
        ? makeDoneResult()
        : { done: false, value: undefined };
    } catch (error) {
      console.error('MessagePortWriter experienced a send failure:', error);

      if (hasFailed) {
        // Break out of repeated failure to send an error. It is unclear how this would occur
        // in practice, but it's the kind of failure mode where it's better to be sure.
        const repeatedFailureError = new Error(
          'MessagePortWriter experienced repeated send failures.',
          { cause: error },
        );
        await connection.sendMessage(repeatedFailureError);
        throw repeatedFailureError;
      } else {
        // postMessage throws only DOMExceptions, which inherit from Error
        await doThrow(error as Error, true);
      }
      return makeDoneResult();
    }
  };

  /**
   * Forwards the error the port and calls `#finish()`. Mutually recursive with `#send()`.
   * For this reason, includes a flag indicating past failure, so that `#send()` can avoid
   * infinite recursion. See `#send()` for more details.
   *
   * @param error - The error to forward.
   * @param hasFailed - Whether sending has failed previously.
   * @returns The final result for this stream.
   */
  async function doThrow(
    error: Error,
    hasFailed = false,
  ): Promise<IteratorResult<undefined, undefined>> {
    const result = send(error, hasFailed);
    await setDone();
    return result;
  }

  const writer: Writer<Yield> = {
    [Symbol.asyncIterator]: () => writer,

    /**
     * Writes the next message to the port.
     *
     * @param value - The next message to write to the port.
     * @returns The result of writing the message.
     */
    next: callIfNotDone(async (value: Yield) => send({ done: false, value })),

    /**
     * Closes the underlying port and returns. Idempotent.
     *
     * @returns The final result for this stream.
     */
    return: doIfNotDone(async () => {
      send(makeDoneResult());
      await setDone();
    }),

    /**
     * Forwards the error to the port and closes this stream. Idempotent.
     *
     * @param error - The error to forward to the port.
     * @returns The final result for this stream.
     */
    throw: doIfNotDone(doThrow),
  };

  return harden(writer);
};

export const makeMessagePortReader = (port: MessagePort) =>
  makeConnectionReader(makeMessagePortConnection(port));
export const makeMessagePortWriter = (port: MessagePort) =>
  makeConnectionWriter(makeMessagePortConnection(port));

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

/**
 * Makes a reader / writer pair over the same connection, and provides convenience methods
 * for cleaning them up.
 *
 * @param port - The message port to make the streams over.
 * @param connection
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
      Promise.all([writer.return(), reader.return()]).then(() => undefined),
    throw: async (error: Error) =>
      Promise.all([writer.throw(error), reader.return()]).then(() => undefined),
  });
};

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
