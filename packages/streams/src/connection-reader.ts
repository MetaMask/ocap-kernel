import { makePromiseKit } from '@endo/promise-kit';
import { hasProperty, isObject } from '@metamask/utils';

import type { Connection } from './connection.js';
import { makeDoneKit, makeDoneResult } from './done-kit.js';
import type { Reader, ReaderMessage, WriterMessage } from './shared.js';

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

/**
 * Make a readable stream over a {@link Connection}.
 *
 * This class is a naive passthrough mechanism for data over a connection.
 * Expects exclusive access to the connection.
 *
 * @param connection - The connection to which the Reader subscribes.
 * @returns A Reader for the connection.
 * @see
 * - {@link makeConnectionWriter} for the corresponding writable stream maker.
 * - The module-level documentation for more details.
 */
export const makeConnectionReader = <Read, Write>(
  connection: Connection<ReaderMessage<Read>, WriterMessage<Write>>,
): Reader<Read> => {
  /**
   * For buffering messages to manage backpressure, i.e. the input rate exceeding the
   * read rate.
   */
  let messageQueue: ReaderMessage<Read>[] = [];

  /**
   * For buffering reads to manage "suction", i.e. the read rate exceeding the input rate.
   */
  const readQueue: PromiseCallbacks[] = [];

  const { setDone, doIfNotDone, returnIfNotDone } = makeDoneKit(async () => {
    // free references held in queues
    messageQueue = [];
    await connection.close();
  });

  const doThrow = async (error: Error): Promise<void> => {
    while (readQueue.length > 0) {
      const { reject } = readQueue.shift() as PromiseCallbacks;
      reject(error);
    }
    await setDone();
  };

  const doReturn = async (): Promise<void> => {
    while (readQueue.length > 0) {
      const { resolve } = readQueue.shift() as PromiseCallbacks;
      resolve(makeDoneResult());
    }
    await setDone();
  };

  connection.setMessageHandler(async (message: ReaderMessage<Read>) => {
    if (message.data instanceof Error) {
      await doThrow(message.data);
      return;
    }

    if (!isIteratorResult(message.data)) {
      await doThrow(
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
      await doReturn();
      return;
    }

    if (readQueue.length > 0) {
      const { resolve } = readQueue.shift() as PromiseCallbacks;
      resolve({ ...message.data });
    } else {
      messageQueue.push(message);
    }
  });

  const reader: Reader<Read> = {
    [Symbol.asyncIterator]: () => reader,

    /**
     * Reads the next message from the connection.
     *
     * @returns The next message from the connection.
     */
    next: returnIfNotDone(async () => {
      const { promise, resolve, reject } = makePromiseKit();
      if (messageQueue.length > 0) {
        const message = messageQueue.shift() as ReaderMessage<Read>;
        resolve({ ...message.data });
      } else {
        readQueue.push({ resolve, reject });
      }
      return promise as Promise<IteratorResult<Read, undefined>>;
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
