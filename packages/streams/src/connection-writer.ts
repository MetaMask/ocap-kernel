import type { Connection } from './connection.js';
import { makeDoneKit, makeDoneResult } from './done-kit.js';
import type { Writer, WriterMessage } from './shared.js';

/**
 * Make a writable stream over a {@link MessagePort}.
 *
 * This class is a naive passthrough mechanism for data over a pair of linked message
 * ports. The message port mechanism is assumed to be completely reliable, and this
 * class therefore has no concept of errors or error handling. Errors and closure
 * are expected to be handled at a higher level of abstraction.
 *
 * @param connection - The connection over which the writer publishes.
 * @returns A Writer for the connection.
 * @see
 * - {@link makeMessagePortReader} for the corresponding readable stream maker.
 * - The module-level documentation for more details.
 */
export const makeConnectionWriter = <Yield>(
  connection: Connection<unknown, WriterMessage<Yield>>,
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
      await send(makeDoneResult());
      await setDone();
    }),

    /**
     * Forwards the error to the port and closes this stream. Idempotent.
     *
     * @param error - The error to forward to the port.
     * @returns The final result for this stream.
     */
    throw: callIfNotDone(doThrow),
  };

  return harden(writer);
};
